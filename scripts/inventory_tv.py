"""One SSAP app inventory. No launch/remove/settings requests or saved client key.

The TV's local TLS certificate is trusted only for this connection and compared
byte for byte before sending SSAP messages. The system trust store is unchanged.
Pairing and READ_INSTALLED_APPS follow LG's ConnectSDK SocketClient protocol.
Uses the already-installed websockets package; it is not an app dependency.
"""
import asyncio
import argparse
import datetime
import hashlib
import json
import pathlib
import re
import ssl

import websockets

HOST = None
PORT = 3001
OUTPUT = pathlib.Path(__file__).resolve().parent.parent / "artifacts/tv-app-inventory.json"


async def inventory():
    # Read only the public certificate, then require this exact leaf for SSAP.
    certificate = await asyncio.to_thread(ssl.get_server_certificate, (HOST, PORT), timeout=5)
    expected = ssl.PEM_cert_to_DER_cert(certificate)
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    context.check_hostname = False  # Identity is the pinned TV certificate, not a public DNS name.
    context.verify_flags |= ssl.VERIFY_X509_PARTIAL_CHAIN
    context.load_verify_locations(cadata=certificate)

    async with websockets.connect(
        f"wss://{HOST}:{PORT}", ssl=context, open_timeout=8,
        close_timeout=2, max_size=2 * 1024 * 1024,
    ) as connection:
        peer = connection.transport.get_extra_info("ssl_object").getpeercert(binary_form=True)
        if peer != expected:
            raise RuntimeError("El certificado de la TV cambio antes del registro.")
        print("TLS verificado para el certificado local: " + hashlib.sha256(peer).hexdigest(), flush=True)
        await connection.send(json.dumps({
            "type": "hello", "id": "hello-1",
            "payload": {"appId": "com.frxn.mipantalla.inventory", "appName": "Mi pantalla - inventario"},
        }))
        registered = False
        query_sent = False
        async for raw in connection:
            message = json.loads(raw)
            if message.get("type") == "hello" and not registered:
                registered = True
                await connection.send(json.dumps({
                    "type": "register", "id": "register-1",
                    "payload": {"manifest": {"manifestVersion": 1, "permissions": ["READ_INSTALLED_APPS"]}},
                }))
                print("Registro enviado: aceptar el aviso de lectura de apps en la TV si aparece.", flush=True)
            elif message.get("type") == "error":
                raise RuntimeError("La TV rechazo el inventario; no se modifico nada.")
            elif message.get("type") == "registered" and not query_sent:
                query_sent = True
                # Do not print or persist the registration payload/client-key.
                await connection.send(json.dumps({
                    "type": "request", "id": "apps-1",
                    "uri": "ssap://com.webos.applicationManager/listApps",
                }))
            elif message.get("type") == "response" and message.get("id") == "apps-1":
                payload = message.get("payload", {})
                if payload.get("returnValue") is False or not isinstance(payload.get("apps"), list):
                    raise RuntimeError("La TV no devolvio una lista de aplicaciones valida.")
                apps = []
                for app in payload["apps"][:512]:
                    app_id = app.get("id") if isinstance(app, dict) else None
                    if not isinstance(app_id, str) or not re.fullmatch(r"[\w.-]{1,128}", app_id):
                        continue
                    row = {"id": app_id, "title": re.sub(r"[\x00-\x1f]", "", str(app.get("title") or app_id))[:160]}
                    if isinstance(app.get("version"), str):
                        row["version"] = app["version"][:40]
                    for key in ("removable", "systemApp", "visible"):
                        if isinstance(app.get(key), bool):
                            row[key] = app[key]
                    apps.append(row)
                OUTPUT.parent.mkdir(exist_ok=True)
                OUTPUT.write_text(json.dumps({
                    "retrievedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                    "source": "SSAP listApps", "apps": apps,
                }, ensure_ascii=False, indent=2), encoding="utf-8")
                print(json.dumps({"count": len(apps), "file": str(OUTPUT), "apps": apps}, ensure_ascii=False), flush=True)
                return
        raise RuntimeError("La TV cerro la sesion sin completar el inventario.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Inventario de apps de una TV webOS; solo lectura.")
    parser.add_argument("--host", required=True, help="IP o nombre local de tu TV")
    options = parser.parse_args()
    HOST = options.host
    try:
        asyncio.run(asyncio.wait_for(inventory(), timeout=55))
    except TimeoutError:
        raise SystemExit("Tiempo agotado; inventario no obtenido, sin cambios en apps.")
    except Exception as error:
        raise SystemExit(f"Inventario no completado: {type(error).__name__}: {error}")
