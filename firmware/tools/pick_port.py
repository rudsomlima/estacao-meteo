"""Escolhe a porta da placa para `pio run -t upload` e `pio device monitor`.

O PlatformIO às vezes escolhe uma porta Bluetooth do Windows (COM de "Serial Padrão por link Bluetooth") em vez da placa.
Aqui a porta é a primeira com o VID de uma ponte ou da USB nativa do ESP32. Para forçar outra, passe --upload-port
ou defina upload_port no platformio.ini (o que o usuário definiu sempre vale).
"""
Import("env")  # noqa: F821  (injetado pelo PlatformIO)

from serial.tools import list_ports

ESP_VIDS = (0x303A, 0x10C4, 0x1A86, 0x0403)  # Espressif (USB nativa), CP210x, CH340, FTDI

if not env.GetProjectOption("upload_port", "") and not env.subst("$UPLOAD_PORT"):  # noqa: F821
    ports = [p for p in list_ports.comports() if p.vid in ESP_VIDS]
    # a USB nativa do ESP32-C3 primeiro: é a placa deste projeto
    ports.sort(key=lambda p: 0 if p.vid == 0x303A else 1)
    if ports:
        env.Replace(UPLOAD_PORT=ports[0].device, MONITOR_PORT=ports[0].device)  # noqa: F821
        print("Porta da placa: %s (%s)" % (ports[0].device, ports[0].description))
    else:
        print("Nenhuma placa ESP32 encontrada na USB. Plugue o cabo (de dados) ou aperte RESET na placa.")
