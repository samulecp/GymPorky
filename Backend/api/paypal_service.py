"""Cliente mínimo de PayPal REST para el entorno Sandbox de PorkyGym."""
import base64
import json
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from django.conf import settings


class PayPalError(Exception):
    pass


def _base_url():
    return 'https://api-m.sandbox.paypal.com' if settings.PAYPAL_MODE == 'sandbox' else 'https://api-m.paypal.com'


def obtener_access_token():
    client_id = settings.PAYPAL_CLIENT_ID
    secret = settings.PAYPAL_CLIENT_SECRET
    if not client_id or not secret:
        raise PayPalError('Faltan PAYPAL_CLIENT_ID o PAYPAL_CLIENT_SECRET en Backend/.env.')
    credenciales = base64.b64encode(f'{client_id}:{secret}'.encode()).decode()
    request = Request(
        f'{_base_url()}/v1/oauth2/token',
        data=urlencode({'grant_type': 'client_credentials'}).encode(),
        headers={'Authorization': f'Basic {credenciales}', 'Content-Type': 'application/x-www-form-urlencoded'},
        method='POST',
    )
    try:
        with urlopen(request, timeout=20) as response:
            payload = json.loads(response.read().decode())
            return payload['access_token']
    except (HTTPError, URLError, TimeoutError, KeyError, ValueError) as exc:
        detalle = ''
        if isinstance(exc, HTTPError):
            try:
                detalle = exc.read().decode()[:500]
            except Exception:
                pass
        raise PayPalError(f'No se pudo autenticar con PayPal: {detalle or str(exc)}') from exc


def solicitud_paypal(path, access_token, payload=None, request_id=None, method='POST'):
    data = json.dumps(payload).encode() if payload is not None else None
    headers = {'Authorization': f'Bearer {access_token}', 'Content-Type': 'application/json'}
    if request_id:
        headers['PayPal-Request-Id'] = request_id
    request = Request(f'{_base_url()}{path}', data=data, headers=headers, method=method)
    try:
        with urlopen(request, timeout=25) as response:
            return json.loads(response.read().decode())
    except (HTTPError, URLError, TimeoutError, ValueError) as exc:
        detalle = ''
        if isinstance(exc, HTTPError):
            try:
                detalle = exc.read().decode()[:800]
            except Exception:
                pass
        raise PayPalError(f'Error en PayPal: {detalle or str(exc)}') from exc


def consultar_recurso(path, access_token):
    request = Request(f'{_base_url()}{path}', headers={'Authorization': f'Bearer {access_token}'}, method='GET')
    try:
        with urlopen(request, timeout=25) as response:
            return json.loads(response.read().decode())
    except (HTTPError, URLError, TimeoutError, ValueError) as exc:
        detalle = ''
        if isinstance(exc, HTTPError):
            try:
                detalle = exc.read().decode()[:800]
            except Exception:
                pass
        raise PayPalError(f'Error consultando PayPal: {detalle or str(exc)}') from exc
