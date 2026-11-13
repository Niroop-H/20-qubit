"""WSGI service for optional Render hosting. No account, storage or paid API dependency."""
import json
import os
from wsgiref.simple_server import make_server
from physics import MODELS

MAX_BYTES = 16384


def application(environ, start_response):
    method = environ.get('REQUEST_METHOD', 'GET')
    path = environ.get('PATH_INFO', '/')
    origin = environ.get('HTTP_ORIGIN', '')
    allowed = {s.strip() for s in os.environ.get('ALLOWED_ORIGINS', 'http://localhost:3000').split(',') if s.strip()}
    headers = [('Content-Type', 'application/json'), ('Cache-Control', 'no-store'), ('X-Content-Type-Options', 'nosniff')]
    if origin in allowed:
        headers += [('Access-Control-Allow-Origin', origin), ('Vary', 'Origin'), ('Access-Control-Allow-Methods', 'GET, POST, OPTIONS'), ('Access-Control-Allow-Headers', 'Content-Type')]

    def respond(status, value):
        body = json.dumps(value, allow_nan=False).encode()
        start_response(status, headers+[('Content-Length', str(len(body)))])
        return [body]

    if origin and origin not in allowed:
        return respond('403 Forbidden', {'error': 'Origin not allowed'})
    if method == 'OPTIONS':
        start_response('204 No Content', headers)
        return [b'']
    if path == '/health' and method == 'GET':
        return respond('200 OK', {'status': 'ok', 'modelVersion': '1.0', 'models': list(MODELS), 'stateless': True})
    model = path.removeprefix('/api/lab/') if path.startswith('/api/lab/') else ''
    if model not in MODELS:
        return respond('404 Not Found', {'error': 'Unknown model'})
    if method != 'POST':
        return respond('405 Method Not Allowed', {'error': 'Use POST'})
    try:
        length = int(environ.get('CONTENT_LENGTH', '0') or 0)
        if length < 1 or length > MAX_BYTES:
            return respond('413 Payload Too Large', {'error': 'Expected JSON body of 1–16384 bytes'})
        if not environ.get('CONTENT_TYPE', '').startswith('application/json'):
            return respond('415 Unsupported Media Type', {'error': 'Use application/json'})
        data = json.loads(environ['wsgi.input'].read(length))
        if not isinstance(data, dict):
            raise ValueError('Expected JSON object')
        return respond('200 OK', {'modelVersion': '1.0', 'model': model, 'result': MODELS[model](data)})
    except (ValueError, TypeError, OverflowError) as exc:
        return respond('400 Bad Request', {'error': str(exc)[:200]})


if __name__ == '__main__':
    # Development only. Render uses gunicorn via render.yaml.
    with make_server('127.0.0.1', int(os.environ.get('PORT', '4001')), application) as httpd:
        httpd.serve_forever()
