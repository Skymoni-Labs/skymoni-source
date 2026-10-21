"""Public account identity only. No private settings or account DB access in the API."""
import base64
import json
import threading
import time
from pathlib import Path


def clean_avatar(value):
    if not isinstance(value, str) or len(value) > 400000:
        return ''
    for prefix, signature in [('data:image/png;base64,', b'\x89PNG\r\n\x1a\n'),
                              ('data:image/jpeg;base64,', b'\xff\xd8\xff')]:
        if value.startswith(prefix):
            try:
                return value if base64.b64decode(value[len(prefix):], validate=True).startswith(signature) else ''
            except (ValueError, TypeError):
                return ''
    return ''


def setting_avatar(setting):
    try:
        value = json.loads(setting) if isinstance(setting, str) else setting
        return clean_avatar(value.get('avatar')) if isinstance(value, dict) else ''
    except (ValueError, TypeError):
        return ''


def public_profile(value):
    return {'id': int(value['id']), 'name': str(value.get('name') or value.get('username') or '社区成员')[:100],
            'username': str(value.get('username') or '')[:100], 'avatar': clean_avatar(value.get('avatar'))}


class AccountProfiles:
    def __init__(self, path):
        self.path = Path(path)
        self.stamp = None
        self.values = {}
        self.observed = 0
        self.recent = {}
        self.lock = threading.RLock()

    def remember(self, actor):
        with self.lock:
            self.recent[str(actor['id'])] = (time.time_ns(), public_profile(actor))

    def get(self, uid, fallback=None):
        with self.lock:
            try:
                stamp = self.path.stat().st_mtime_ns
                if stamp != self.stamp:
                    value = json.loads(self.path.read_text(encoding='utf8'))
                    profiles = value['profiles']
                    if not isinstance(profiles, dict) or not isinstance(value['observedAt'], int):
                        raise ValueError('Invalid public identity projection')
                    self.values, self.observed, self.stamp = profiles, value['observedAt'], stamp
                    self.recent = {key: item for key, item in self.recent.items() if item[0] > self.observed}
            except (OSError, ValueError, TypeError, KeyError):
                pass  # Keep the last known projection across temporary read/refresh failures.
            recent = self.recent.get(str(uid))
            value = recent[1] if recent else self.values.get(str(uid), fallback)
            return public_profile({**value, 'id': uid}) if isinstance(value, dict) else None
