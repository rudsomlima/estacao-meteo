"""Gera firmware/include/wm_strings_pt.h: os textos do portal Wi-Fi (WiFiManager) em português.

Parte do arquivo em inglês da biblioteca e troca os textos que aparecem para quem configura a estação pelo celular.
Rode depois de atualizar o WiFiManager:  python firmware/tools/make_wm_strings.py
(o platformio.ini aponta WM_STRINGS_FILE para o arquivo gerado).
"""
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
SRC = next(ROOT.glob(".pio/libdeps/*/WiFiManager/wm_strings_en.h"), None)

PAIRS = [
    ("<button>Configure WiFi</button>", "<button>Configurar o Wi-Fi</button>"),
    ("<button>Configure WiFi (No scan)</button>", "<button>Configurar o Wi-Fi (sem procurar redes)</button>"),
    ("<button>Info</button>", "<button>Informações</button>"),
    ("<button>Setup</button>", "<button>Ajustes</button>"),
    ("<button>Close</button>", "<button>Fechar</button>"),
    ("<button>Restart</button>", "<button>Reiniciar</button>"),
    ("<button>Exit</button>", "<button>Sair</button>"),
    ("<button class='D'>Erase</button>", "<button class='D'>Apagar</button>"),
    ("<button>Update</button>", "<button>Atualizar</button>"),
    ("<label for='s'>SSID</label>", "<label for='s'>Rede Wi-Fi</label>"),
    ("<label for='p'>Password</label>", "<label for='p'>Senha</label>"),
    ("Show Password", "Mostrar a senha"),
    ("<button type='submit'>Save</button>", "<button type='submit'>Salvar</button>"),
    ("<button name='refresh' value='1'>Refresh</button>", "<button name='refresh' value='1'>Procurar de novo</button>"),
    ("Saving Credentials<br/>Trying to connect ESP to network.<br />If it fails reconnect to AP to try again",
     "Salvando<br/>A estação vai se conectar à rede escolhida.<br />Se não conseguir, ela abre este portal de novo"),
    ("<div class='msg S'>Saved<br/></div>", "<div class='msg S'>Salvo<br/></div>"),
    ("Erase WiFi config", "Apagar o Wi-Fi salvo"),
    ("<button>Back</button>", "<button>Voltar</button>"),
    ("<strong>Connected</strong> to {v}<br/><em><small>with IP {i}</small></em>", "<strong>Conectada</strong> a {v}<br/><em><small>IP {i}</small></em>"),
    ("<strong>Not connected</strong> to {v}{r}", "<strong>Não conectada</strong> a {v}{r}"),
    ("<div class='msg'>No AP set</div>", "<div class='msg'>Nenhuma rede salva</div>"),
    ('"Credentials saved"', '"Wi-Fi salvo"'),
    ('"Config ESP"', '"Estação Meteo"'),
    ('"No networks found. Refresh to scan again."', '"Nenhuma rede encontrada. Toque em Procurar de novo."'),
    ('"Info"', '"Informações"'),
    ('"Setup"', '"Ajustes"'),
]


def main():
    if not SRC:
        sys.exit("WiFiManager não encontrado: rode `pio run` uma vez para baixar as bibliotecas")
    text = SRC.read_text(encoding="utf-8")
    for a, b in PAIRS:
        if a in text:
            text = text.replace(a, b)
        else:
            print("aviso: texto não encontrado:", a[:60])
    out = ROOT / "include" / "wm_strings_pt.h"
    out.parent.mkdir(exist_ok=True)
    out.write_text("// Gerado por tools/make_wm_strings.py a partir do wm_strings_en.h do WiFiManager. Não edite à mão.\n" + text, encoding="utf-8", newline="\n")
    print(out)


if __name__ == "__main__":
    main()
