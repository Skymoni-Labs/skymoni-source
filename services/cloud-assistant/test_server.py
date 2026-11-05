"""Run with python -m unittest discover -s services/cloud-assistant -v."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import patch
import http.client
import io
import json
import tempfile
import threading
import unittest
import uuid
import base64
import urllib.error

import server


CONFIG = dict(api_key='sk-unit-test-secret-only', signing_secret='s' * 64,
              model='deepseek-flash', daily_requests=200, visitor_daily_requests=20,
              daily_tokens=300000, max_output_tokens=900, requests_per_minute=3)

def session_header(user=1):
    claims = dict(iss='new-api', token_use='access', sid='test-session', sub=str(user), aud=['new-api-dashboard'])
    return 'Bearer x.' + base64.urlsafe_b64encode(json.dumps(claims).encode()).decode().rstrip('=') + '.signature'


class FakeResponse:
    def __init__(self, value):
        self.raw = json.dumps(value).encode()
    def __enter__(self):
        return self
    def __exit__(self, *args):
        pass
    def read(self, limit):
        return self.raw[:limit]


class FakeStream(FakeResponse):
    def __init__(self, texts, complete=True):
        parts = [dict(choices=[dict(delta=dict(content=text), finish_reason=None)]) for text in texts]
        if complete:
            parts += [dict(choices=[dict(delta={}, finish_reason='stop')], usage=dict(prompt_tokens=1000, completion_tokens=80))]
        raw = b''.join(b'data: ' + json.dumps(part).encode() + b'\n\n' for part in parts)
        if complete:
            raw += b'data: [DONE]\n\n'
        self.stream = io.BytesIO(raw)
    def readline(self, limit):
        return self.stream.readline(limit)


class AssistantTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.app = server.Assistant(dict(CONFIG), Path(__file__).with_name('knowledge.json'), self.directory.name)
        self.app.live_context = lambda question: ''

    def tearDown(self):
        self.directory.cleanup()

    def payload(self, text='我想创建 API 密钥'):
        return dict(request_id=str(uuid.uuid4()), message=text, page='/keys')

    def test_auth_rejects_anonymous_cookie_hints_and_api_keys(self):
        with patch.object(self.app.opener, 'open') as upstream:
            for token in [None, '', 'Bearer sk-site-api-key', 'Bearer garbage', 'Bearer x.e30.signature']:
                with self.assertRaises(server.AssistantError) as caught:
                    self.app.authenticate(token, 'relay', '127.0.0.1')
                self.assertEqual(caught.exception.status, 401)
        upstream.assert_not_called()

    def test_auth_checks_main_site_and_binds_usage_to_account(self):
        def verify(request, timeout):
            self.assertEqual(request.full_url, 'http://127.0.0.1:8081/api/user/self')
            self.assertEqual(request.get_header('Authorization'), session_header())
            return FakeResponse(dict(success=True, data=dict(id=1, email='private@example.com')))
        with patch.object(self.app.opener, 'open', side_effect=verify):
            first = self.app.authenticate(session_header(), 'relay', '127.0.0.1')
            second = self.app.authenticate(session_header(), 'community', '127.0.0.1')
        self.assertEqual(first, second)
        self.assertNotIn('private', first)
        self.assertNotIn('1', first[:0])

    def test_revoked_expired_forged_and_unavailable_auth_fail_closed(self):
        for status, expected in [(401, 401), (403, 401), (500, 503), (429, 503)]:
            with patch.object(self.app.opener, 'open', side_effect=urllib.error.HTTPError('url', status, '', {}, None)):
                with self.assertRaises(server.AssistantError) as caught:
                    self.app.authenticate(session_header(), 'relay', '127.0.0.1')
                self.assertEqual(caught.exception.status, expected)
        with patch.object(self.app.opener, 'open', return_value=FakeResponse(dict(success=True, data=dict(id=2)))):
            with self.assertRaises(server.AssistantError):
                self.app.authenticate(session_header(), 'relay', '127.0.0.1')

    def test_grounding_and_follow_up(self):
        sources = self.app.knowledge.retrieve('怎么创建 API 密钥', [])
        self.assertTrue(any('密钥' in chunk['title'] for chunk in sources[:3]))
        sources = self.app.knowledge.retrieve('下一步呢', [dict(role='user', content='在 Cherry Studio 中接入')])
        self.assertTrue(any('Cherry' in chunk['title'] for chunk in sources))
        sources = self.app.knowledge.retrieve('创建好了，下一步在 Cherry Studio 里地址怎么填？', [dict(role='user', content='怎么创建 API 密钥')])
        self.assertIn('Cherry', sources[0]['title'])
        self.assertGreaterEqual(self.app.knowledge.document_count, 36)

    def test_provider_payload_redaction_sources_and_idempotency(self):
        captured = []
        def provider(request, timeout):
            captured.append(json.loads(request.data))
            self.assertEqual(request.full_url, 'https://api.deepseek.com/chat/completions')
            self.assertEqual(request.get_header('Authorization'), 'Bearer ' + CONFIG['api_key'])
            return FakeResponse(dict(choices=[dict(message=dict(content='打开[密钥](/keys)。[坏链接](https://evil.example) <img src=x>'))],
                                     usage=dict(prompt_tokens=2000, completion_tokens=60)))
        data = self.payload('密钥 sk-0123456789abcdef 怎么用，test@example.com')
        with patch.object(self.app.opener, 'open', side_effect=provider):
            result = self.app.chat(data, 'visitor', 'ip')
            again = self.app.chat(data, 'visitor', 'ip')
        self.assertEqual(len(captured), 1)
        self.assertEqual(again['answer'], result['answer'])
        self.assertNotIn('evil.example', result['answer'])
        serialized = json.dumps(captured)
        self.assertNotIn(CONFIG['api_key'], serialized)
        self.assertNotIn('sk-0123456789abcdef', serialized)
        self.assertNotIn('test@example.com', serialized)
        self.assertEqual(captured[0]['thinking'], dict(type='disabled'))
        self.assertEqual(result['remaining'], 19)
        self.assertTrue(result['sources'])
        with self.assertRaises(server.AssistantError) as caught:
            self.app.chat(data, 'different-visitor', 'ip')
        self.assertEqual(caught.exception.code, 'request_conflict')
        with self.app.budget.connect() as db:
            row = db.execute('select * from requests').fetchone()
            self.assertEqual(row['tokens'], 2060)
            self.assertNotIn('message', row.keys())

    def test_failed_generation_retains_reservation_and_never_repeats(self):
        data = self.payload()
        with patch.object(self.app.opener, 'open', side_effect=TimeoutError), self.assertRaises(server.AssistantError):
            self.app.chat(data, 'visitor', 'ip')
        with patch.object(self.app.opener, 'open') as provider, self.assertRaises(server.AssistantError) as caught:
            self.app.chat(data, 'visitor', 'ip')
        self.assertEqual(caught.exception.code, 'request_failed')
        provider.assert_not_called()
        with self.app.budget.connect() as db:
            self.assertGreater(db.execute('select tokens from requests').fetchone()[0], 900)

    def test_empty_response_is_controlled_error(self):
        with patch.object(self.app.opener, 'open', return_value=FakeResponse(dict(choices=[dict(message=dict(content=''))]))):
            with self.assertRaises(server.AssistantError) as caught:
                self.app.chat(self.payload(), 'visitor', 'ip')
        self.assertEqual(caught.exception.status, 502)

    def test_stream_deltas_usage_and_cached_retry(self):
        events, captured = [], []
        def provider(request, timeout):
            captured.append(json.loads(request.data))
            return FakeStream(['打开', '[密钥](/keys)', '，复制即可。'])
        data = self.payload()
        with patch.object(self.app.opener, 'open', side_effect=provider):
            result = self.app.chat(data, 'visitor', 'ip', lambda kind, value: events.append((kind, value)))
            cached = self.app.chat(data, 'visitor', 'ip', lambda *args: None)
        self.assertEqual(len(captured), 1)
        self.assertTrue(captured[0]['stream'])
        self.assertEqual(captured[0]['stream_options'], dict(include_usage=True))
        self.assertEqual(events[0][0], 'start')
        deltas = [value['text'] for kind, value in events if kind == 'delta']
        self.assertEqual(deltas[0], '打开')
        self.assertTrue(deltas[-1].endswith('复制即可。'))
        self.assertEqual(result['answer'], cached['answer'])
        with self.app.budget.connect() as db:
            self.assertEqual(db.execute('select tokens from requests').fetchone()[0], 1080)

    def test_truncated_stream_retains_reservation(self):
        with patch.object(self.app.opener, 'open', return_value=FakeStream(['部分文字'], complete=False)):
            with self.assertRaises(server.AssistantError) as caught:
                self.app.chat(self.payload(), 'visitor', 'ip', lambda *args: None)
        self.assertEqual(caught.exception.code, 'provider_unavailable')
        with self.app.budget.connect() as db:
            row = db.execute('select state,tokens from requests').fetchone()
            self.assertEqual(row['state'], 'failed')
            self.assertGreater(row['tokens'], 900)

    def test_stream_redaction_holds_split_credential(self):
        self.assertEqual(server.stream_text('密钥 sk-abcd'), '密钥 ')
        self.assertNotIn('abcdefghijklmnop', server.stream_text('密钥 sk-abcdefghijklmnop。'))
        self.assertNotIn('person@example', server.stream_text('邮箱 person@example'))

    def test_cookie_tamper_and_expiry(self):
        visitor, cookie = self.app.visitor_cookie(None)
        self.assertIn('HttpOnly; Secure; SameSite=Lax', cookie)
        self.assertEqual(self.app.visitor_cookie(cookie.split(';')[0]), (visitor, None))
        self.assertIsNotNone(self.app.visitor_cookie(cookie.split(';')[0] + 'bad')[1])
        with patch('server.time.time', return_value=99999999999):
            self.assertIsNotNone(self.app.visitor_cookie(cookie.split(';')[0])[1])
        self.assertIsNotNone(self.app.visitor_cookie('bad@cookie=x')[1])

    def test_invalid_input_never_generates(self):
        cases = [dict(message=''), dict(message='a' * 1001), dict(history=[dict(role='system', content='bad')]),
                 dict(history=[{}] * 9), dict(request_id='short')]
        with patch.object(self.app.opener, 'open') as provider:
            for override in cases:
                with self.assertRaises(server.AssistantError):
                    self.app.chat(self.payload() | override, 'v', 'i')
        provider.assert_not_called()

    def test_live_refresh_follows_published_documents(self):
        self.app.local_json = lambda path: dict(success=True, data=([dict(id='new-guide')] if path.endswith('/public') else
            dict(id='new-guide', title='新功能指南', blocks=[dict(type='paragraph', text='开启新功能测试。')])))
        self.app.refresh_knowledge()
        self.assertEqual(self.app.knowledge.document_count, 1)
        self.assertIn('新功能', self.app.knowledge.retrieve('新功能', [])[0]['title'])


class BudgetTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.path = Path(self.directory.name) / 'usage.db'
        self.now = [1793836790.0]
        self.config = CONFIG | dict(daily_requests=5, requests_per_minute=100)
        self.budget = server.Budget(self.path, self.config, lambda: self.now[0])

    def tearDown(self):
        self.directory.cleanup()

    def test_atomic_concurrent_cap_and_restart(self):
        def reserve(index):
            try:
                self.budget.reserve(str(index), 'v', 'ip', 1000)
                return True
            except server.AssistantError:
                return False
        with ThreadPoolExecutor(max_workers=10) as pool:
            self.assertEqual(sum(pool.map(reserve, range(20))), 5)
        restarted = server.Budget(self.path, self.config, lambda: self.now[0])
        self.assertEqual(restarted.remaining('v', 'ip'), 0)
        with restarted.connect() as db:
            self.assertEqual(db.execute("select count(*) from requests where state='uncertain'").fetchone()[0], 5)
        self.now[0] += 86400
        self.assertEqual(restarted.remaining('v', 'ip'), 5)

    def test_same_ip_still_limited_with_new_cookie(self):
        self.budget.config['visitor_daily_requests'] = 2
        self.budget.reserve('one', 'v1', 'ip', 100)
        self.budget.reserve('two', 'v2', 'ip', 100)
        with self.assertRaises(server.AssistantError) as caught:
            self.budget.reserve('three', 'v3', 'ip', 100)
        self.assertEqual(caught.exception.code, 'visitor_budget')

    def test_unknown_usage_conservative_and_excess_pauses_day(self):
        self.budget.reserve('one', 'v', 'ip', 1000)
        self.budget.finish('one', dict(answer='ok'), None)
        with self.budget.connect() as db:
            self.assertEqual(db.execute('select tokens from requests').fetchone()[0], 1000)
        self.budget.reserve('two', 'v', 'ip', 1000)
        self.budget.finish('two', dict(answer='ok'), dict(prompt_tokens=200, completion_tokens=901))
        self.assertEqual(self.budget.remaining('v', 'ip'), 0)

    def test_token_and_minute_cap(self):
        self.budget.config.update(daily_tokens=1000, requests_per_minute=1)
        self.budget.reserve('one', 'v', 'ip', 400)
        with self.assertRaises(server.AssistantError) as caught:
            self.budget.reserve('two', 'v', 'ip', 400)
        self.assertEqual(caught.exception.code, 'too_fast')
        with self.assertRaises(server.AssistantError) as caught:
            self.budget.reserve('three', 'v', 'ip2', 601)
        self.assertEqual(caught.exception.code, 'daily_budget')


class HttpTest(unittest.TestCase):
    def setUp(self):
        AssistantTest.setUp(self)
        self.auth_patch = patch.object(self.app, 'authenticate', side_effect=lambda authorization, scope, ip: 'account' if authorization == session_header() else self.deny())
        self.auth_patch.start()
        self.addCleanup(self.auth_patch.stop)
    def deny(self):
        raise server.AssistantError(401, 'login_required', '登录后才能和小云对话。')
    tearDown = AssistantTest.tearDown
    payload = AssistantTest.payload
    def test_http_flushes_partial_text_before_final_result(self):
        gate = threading.Event()
        class GatedStream(FakeStream):
            calls = 0
            def readline(self, limit):
                self.calls += 1
                if self.calls == 2:
                    gate.wait(3)
                return super().readline(limit)
        service = server.Server(('127.0.0.1', 0), server.Handler, self.app)
        thread = threading.Thread(target=service.serve_forever, daemon=True)
        thread.start()
        connection = http.client.HTTPConnection(*service.server_address, timeout=3)
        visitor, cookie = self.app.visitor_cookie(None)
        try:
            with patch.object(self.app.opener, 'open', return_value=GatedStream(['第一步', '然后保存'])):
                connection.request('POST', '/api/cloud-assistant/chat', json.dumps(self.payload()),
                    {'Authorization': session_header(), 'Content-Type': 'application/json', 'X-Skymoni-Assistant': '1', 'Accept': 'text/event-stream', 'Cookie': cookie.split(';')[0]})
                response = connection.getresponse()
                self.assertEqual(response.getheader('Content-Type'), 'text/event-stream; charset=utf-8')
                self.assertEqual(response.getheader('X-Accel-Buffering'), 'no')
                first = b''.join(response.readline() for _ in range(6))
                self.assertIn('第一步'.encode(), first)
                self.assertNotIn(b'event: done', first)
                self.assertFalse(gate.is_set())
                gate.set()
                self.assertIn(b'event: done', response.read())
        finally:
            gate.set()
            connection.close()
            service.shutdown()
            service.server_close()
            thread.join()

    def test_http_guards_and_cookie_handshake(self):
        service = server.Server(('127.0.0.1', 0), server.Handler, self.app)
        thread = threading.Thread(target=service.serve_forever, daemon=True)
        thread.start()
        def request(method, path, body=None, headers=None):
            connection = http.client.HTTPConnection(*service.server_address, timeout=3)
            connection.request(method, path, body, headers or {})
            response = connection.getresponse()
            result = (response.status, dict(response.getheaders()), json.loads(response.read()))
            connection.close()
            return result
        try:
            self.assertEqual(request('GET', '/api/cloud-assistant/status')[0], 401)
            self.assertEqual(request('GET', '/api/cloud-assistant/status', headers={'Cookie': 'new_api_has_session=1'})[0], 401)
            status, headers, result = request('GET', '/api/cloud-assistant/status', headers={'Authorization': session_header()})
            self.assertEqual(status, 200)
            self.assertNotIn('api_key', result)
            cookie = headers['Set-Cookie'].split(';')[0]
            base = {'Authorization': session_header(), 'Content-Type': 'application/json', 'X-Skymoni-Assistant': '1', 'Cookie': cookie}
            body = json.dumps(self.payload())
            with patch.object(self.app.opener, 'open') as provider:
                anonymous = {k:v for k,v in base.items() if k != 'Authorization'}
                self.assertEqual(request('POST', '/api/cloud-assistant/chat', body, anonymous)[0], 401)
                provider.assert_not_called()
            self.assertEqual(self.app.budget.remaining('account', self.app.ip_hash('127.0.0.1')), 20)
            self.assertEqual(request('POST', '/api/cloud-assistant/chat', body, base | dict(Origin='https://evil.example'))[0], 403)
            self.assertEqual(request('POST', '/api/cloud-assistant/chat', body, {'Content-Type': 'application/json'})[0], 403)
            self.assertEqual(request('POST', '/api/cloud-assistant/chat', 'x' * 24577, base)[0], 413)
            self.assertEqual(request('POST', '/api/cloud-assistant/chat', 'null', base)[0], 400)
            no_cookie = {k: v for k, v in base.items() if k != 'Cookie'}
            self.assertEqual(request('POST', '/api/cloud-assistant/chat', body, no_cookie)[2]['error'], 'session_required')
            with patch.object(self.app.opener, 'open', return_value=FakeResponse(dict(choices=[dict(message=dict(content='可以在密钥页创建。'))], usage=dict(prompt_tokens=1500, completion_tokens=30)))):
                self.assertEqual(request('POST', '/api/cloud-assistant/chat', body, base | dict(Origin=server.SITE))[0], 200)
        finally:
            service.shutdown()
            service.server_close()
            thread.join()


class UrlTest(unittest.TestCase):
    def test_only_known_public_site_links(self):
        for value in ['javascript:alert(1)', 'https://evil.example', '//evil.example/keys',
                      'https://u:p@skymoni.com/keys', '/keys?token=secret', '/docs#x', '/api/user/self', 'https://[bad']:
            self.assertIsNone(server.safe_url(value), value)
        self.assertEqual(server.safe_url('/docs?doc=getting-started&edit=false'), server.SITE + '/docs?doc=getting-started&edit=false')


if __name__ == '__main__':
    unittest.main()
