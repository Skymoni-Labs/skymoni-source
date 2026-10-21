"""Read-only projection of public names/avatars. Runs outside the unprivileged API."""
import csv
import io
import json
import os
import sqlite3
import subprocess
import tempfile
import time
from contextlib import closing
from pathlib import Path
from urllib.request import urlopen

from account_profiles import public_profile, setting_avatar


def postgres_profiles(ids):
    docker = ['/usr/bin/docker', '--host', 'unix:///var/run/docker.sock']
    container = 'moni-newapi-postgres-1'
    info = json.loads(subprocess.check_output(docker+['inspect', container], timeout=5))[0]
    env = dict(item.split('=', 1) for item in info['Config']['Env'] if '=' in item)
    user = env.get('POSTGRES_USER', 'postgres')
    database = env.get('POSTGRES_DB', user)
    result = {}
    for start in range(0, len(ids), 500):
        batch = ','.join(str(int(uid)) for uid in ids[start:start+500])
        # Select only public identity columns. No passwords, email, tokens or private settings.
        query = "COPY (SELECT id,username,display_name,COALESCE(NULLIF(setting,'')::jsonb->>'avatar','') FROM users WHERE status=1 AND deleted_at IS NULL AND id IN ("+batch+")) TO STDOUT WITH (FORMAT CSV)"
        raw = subprocess.check_output(docker+['exec', '-e', 'PGOPTIONS=-c default_transaction_read_only=on -c statement_timeout=5000', container,
            'psql', '-X', '-q', '-w', '-U', user, '-d', database, '-c', query], timeout=8, stderr=subprocess.DEVNULL)
        for uid, username, name, avatar in csv.reader(io.StringIO(raw.decode('utf8'))):
            result[str(int(uid))] = public_profile(dict(id=int(uid), username=username, name=name, avatar=avatar))
    return result


def public_creator_ids():
    ids = set()
    for path in ['/api/creators/public?view=cards', '/api/creators/home?view=cards']:
        with urlopen('http://127.0.0.1:8081'+path, timeout=8) as response:
            raw = response.read(8*1024*1024+1)
        if len(raw) > 8*1024*1024:
            raise ValueError('Public creator response too large')
        result = json.loads(raw)
        if not result.get('success'):
            raise ValueError('Public creator response unavailable')
        data = result['data']
        works = data if isinstance(data, list) else data.get('works', [])
        authors = [] if isinstance(data, list) else data.get('authors', [])
        for item in works + authors:
            uid = item.get('ownerId', item.get('userId'))
            if not item.get('sample') and isinstance(uid, int) and uid > 0:
                ids.add(uid)
    return ids


def project(community_db, output, reader=postgres_profiles, creators=public_creator_ids):
    observed = time.time_ns()  # Before reading accounts, so fresh authenticated identity wins races.
    with closing(sqlite3.connect(Path(community_db).resolve().as_uri()+'?mode=ro', uri=True)) as db:
        ids = {row[0] for row in db.execute('SELECT id FROM members')}
    ids.update(creators())
    ids = sorted(int(uid) for uid in ids if int(uid) > 0)
    current = reader(ids)  # Failure leaves the previous complete projection untouched.
    profiles = {str(uid): public_profile(current.get(str(uid), dict(id=uid, name='社区成员'))) for uid in ids}
    payload = json.dumps({'observedAt': observed, 'profiles': profiles}, ensure_ascii=False).encode()
    destination = Path(output)
    fd, temporary = tempfile.mkstemp(prefix='.account-profiles-', dir=destination.parent)
    try:
        with os.fdopen(fd, 'wb') as stream:
            stream.write(payload); stream.flush(); os.fsync(stream.fileno())
        os.chmod(temporary, 0o644)  # Public fields only, inside StateDirectory mode 0700.
        os.replace(temporary, destination)
    finally:
        if os.path.exists(temporary): os.unlink(temporary)


if __name__ == '__main__':
    project('/var/lib/skymoni-community/community.db', '/var/lib/skymoni-community/account-profiles.json')
