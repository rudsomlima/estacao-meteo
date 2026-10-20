# Site da Estação Meteo

React 19, Vite, Tailwind CSS v4, motion, Lenis (rolagem suave), lucide-react e MapLibre GL.

```bash
npm ci
npm run dev       # http://localhost:5173
npm run build     # checa os tipos e gera dist/
```

- Sem a API o site entra em **modo demonstração** (8 estações simuladas, sinalizado na barra superior).
- Com a API local (`cd ../worker && npm run dev`) o Vite encaminha `/api` para a porta 8787. Na raiz do projeto, `npm run dev` sobe tudo (banco, estações de exemplo, API e site).
- Tiles do mapa: veja `.env.example`.

## Estrutura

```
src/
├── App.tsx                  rotas por hash: #/ (mapa), #/s/<id> (estação), #/s/<id>/config (configurações),
│                            #/config (ajustes), #/analises e #/admin (administrador)
├── components/
│   ├── MapPage, MapView     mapa, camadas, pinos, partículas de vento
│   ├── StationPanel         resumo ao clicar num pino
│   ├── AddStationDialog     criar estação e mostrar a chave uma vez
│   ├── Hero, StationFigure  página da estação e figura animada (SVG)
│   ├── Trends, Chart        gráficos e rosa dos ventos
│   ├── StationSettings      configurações da estação: energia, diagnóstico e configuração remota
│   ├── ConfigPanel          placa, sensores e pinos, bateria, envio, vento e economia
│   ├── GlobalSettings       ajustes do site: unidades, mapa, favoritas e Telegram
│   ├── AdminPage, admin/    painel do administrador (visão geral, configuração em massa, firmware, site e placas, usuários)
│   └── UsbDevice, FlashSetup  reconhecimento da placa pela USB e gravação do firmware (Web Serial)
├── hooks/                   useNetwork (API ou demonstração), useRoute, useLenis
└── lib/                     api, derive (cálculos), battery, energy (modelo de consumo), demo, colors,
                             usb, flash, command (Web Serial), pins, prefs, auth, session, admin
```

O `predev` e o `prebuild` copiam o worker do MapLibre para `public/maplibre/`.
