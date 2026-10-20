# Testes na placa de verdade

Ferramentas para conferir o firmware numa placa ESP32-C3 ligada por USB, falando o mesmo protocolo JSON que o site usa.

## Preparar

- Grave o firmware: `pio run -t upload` (a placa precisa estar acordada; com o cabo plugado ela não dorme).
- Feche o **monitor serial** e outras abas do site: a porta USB é de um programa só por vez.
- Use o Python do PlatformIO (já tem `pyserial`): em geral `~/.platformio/penv/Scripts/python.exe` no Windows.

A porta é achada sozinha (a USB nativa do ESP32-C3 primeiro). Para forçar, defina `METEO_PORT` (por exemplo `COM8` ou `/dev/ttyACM0`).

## Verificações rápidas

```
python firmware/tools/hwtest/checks.py
```

Em segundos, sem bateria, vento, chuva nem rede: identificação, a configuração guardada, a validação dos pinos no firmware, os limites dos campos e a configuração aplicada pelo cabo. Restaura os valores originais no fim.

## A biblioteca `station.py`

Para escrever os seus próprios testes:

```python
from station import Board, Api, check, summary, say

b = Board()                       # ou Board("COM8")
h = b.hello()                     # fw, id, servidor, Wi-Fi salvo
d = b.diag()                      # configuração completa + estado do ciclo
ver = d["cfg"]["version"]

b.config({"interval_min": 2, "version": ver})   # aplica pelo cabo (use a versão que a placa já tem)
b.ask({"cmd": "simvbat", "v": 3.4}, lambda o: "simvbat" in o)  # simula a bateria
b.ask({"cmd": "nettest", "url": "https://..."}, lambda o: "wifi_ms" in o)  # testa rede e HTTPS
mark = b.mark(); b.wait_line(r"POST 200", mark, 60)  # espera uma linha do log

api = Api()                       # conferir no servidor (METEO_API, padrão http://127.0.0.1:8787)
api.login_dev()
print(api.station("usina"))
b.close()
```

Todos os comandos USB estão documentados no topo de [`station.py`](station.py).

## Testes mais longos (manuais)

Dependem de tempo, de uma rede Wi-Fi ou de uma ação física; rode um por vez quando precisar.

- **Intervalos e envio em lote.** `b.config({"interval_min": 1, "send_every": 3, ...})` e meça o tempo entre as linhas `bateria`/`POST` do log.
- **Bateria.** `simvbat` para percorrer normal → economia → crítico → carregando e conferir `diag()["state"]` (`level`, `charging`, `interval_s`).
- **HTTPS.** `nettest` para o servidor real (deve validar) e para um certificado autoassinado (deve recusar).
- **Portal Wi-Fi.** `{"cmd":"portal"}`: o ponto de acesso `EstacaoMeteo-XXXX` aparece; conecte e abra `http://192.168.4.1/`.
- **Sinal de vida sem sensor.** `env_sensor: 0`, `idle_every: N`: o envio sai a cada N intervalos.
- **Formato do envio.** `{"cmd":"body","columns":true}` mostra o corpo que o próximo envio levaria, sem enviar.

> No Windows: solte a porta (`b.close()` ou feche o programa) **antes** de a placa reiniciar e reabra depois que ela reaparecer (`b.reopen()`); abrir a porta durante a reconexão da USB deixa o driver com uma porta morta.
