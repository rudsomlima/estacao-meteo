# Materiais de terceiros

## Windicator V2.0 "Compact" (peças 3D do vento)

A pasta [adaptacao_sensores_v2](adaptacao_sensores_v2/) é uma **adaptação** do modelo 3D **Windicator V2.0 "Compact"** para receber um magnetômetro (direção) e um sensor Hall (velocidade). As peças modificadas (`01` a `05`) e as novas partem das malhas do projeto original.

- **A licença do Windicator original não foi verificada por este projeto.** O código MIT deste repositório **não** se aplica a ele.
- Por isso, o `.gitignore` **não inclui** os arquivos `.stl` e `.3mf` (o modelo original e as peças derivadas dele).
- Antes de publicar ou redistribuir esses arquivos, confira a licença do autor original e respeite a atribuição que ela exigir. Se ela permitir, remova as linhas correspondentes do `.gitignore`.
- Sem os arquivos 3D, você obtém o modelo original com o autor e gera as peças adaptadas com os scripts em `adaptacao_sensores_v2/fonte/` (veja o README da pasta).
- As imagens de pré-visualização (`*.png`) mostram a geometria adaptada.

## Bibliotecas

| Parte | Biblioteca | Licença |
|---|---|---|
| Firmware | arduino-esp32, WiFiManager, Adafruit BME280, ArduinoJson | LGPL-2.1, MIT, BSD, MIT |
| Site | React, Vite, Tailwind CSS, motion, Lenis, lucide-react, MapLibre GL JS | MIT, MIT, MIT, MIT, MIT, ISC, BSD-3-Clause |
| API | wrangler, @cloudflare/workers-types | MIT / Apache-2.0 |
| Fontes | Bricolage Grotesque, Inter, Geist Mono (via Fontsource) | SIL OFL 1.1 |

Confira o `package.json` e o `platformio.ini` para as versões exatas e o arquivo de licença de cada pacote.

## Mapas

Os mapas usam dados do **OpenStreetMap** (© colaboradores do OpenStreetMap, ODbL). Por padrão o site carrega os tiles públicos do OSM, que têm [política de uso](https://operations.osmfoundation.org/policies/tiles/) própria. Para muitos acessos, use um provedor de tiles (veja [docs/implantacao.md](docs/implantacao.md#mapa)).
