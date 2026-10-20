# Contribuindo

Obrigado por ajudar! O projeto está em fase inicial e **o que mais falta é validação em hardware real**. Qualquer relato de montagem ou medição já ajuda.

## Formas de contribuir

1. **Medições de bancada.** Corrente em deep sleep, em light sleep e num envio completo. Ângulo da biruta, pulsos falsos do Hall, alcance do Wi-Fi. Abra uma issue com o modelo da placa, a bateria e os números (veja o modelo de issue "Medição").
2. **Relatos de montagem.** O que funcionou, o que mudou na lista de materiais, fotos.
3. **Documentação.** Correções, traduções (a documentação detalhada está em português do Brasil) e novos diagramas.
4. **Código.** Veja as ideias em [docs/energia.md](docs/energia.md#ideias-para-economizar-ainda-mais).

## Preparar o ambiente

```bash
# tudo de uma vez (banco, migrações, estações de exemplo simuladas, API e site): na raiz
(cd web && npm ci) && (cd worker && npm ci)   # na primeira vez
npm run dev

# testes da API (com a API rodando)
cd worker && npm run smoke

# firmware
pip install platformio
cd firmware && pio run
# verificações numa placa de verdade (opcional): veja firmware/tools/hwtest/README.md
python firmware/tools/hwtest/checks.py
```

## Antes de abrir um pull request

- `cd web && npm run build` passa (inclui a checagem de tipos).
- `cd worker && npx tsc --noEmit && npm run smoke` passam com a API rodando.
- `cd firmware && pio run` compila. Se houver uma placa, `python firmware/tools/hwtest/checks.py` passa.
- Mudou a ligação, a energia ou a arquitetura? Atualize `docs/tools/make_diagrams.py`, rode `python docs/tools/make_diagrams.py` e inclua os SVGs gerados.
- Mudou uma tela que aparece na documentação? Refaça as capturas com `node docs/tools/capture_screens.mjs` (veja [docs/README.md](docs/README.md#figuras)) e confira o texto do guia.
- Mudou um valor de configuração? Atualize juntos: `worker/src/shared.ts` (limites e padrões), `web/src/types.ts`, `web/src/components/ConfigPanel.tsx`, `web/src/lib/demo.ts`, `firmware/src/config.h` e `settings.cpp`, e `docs/api.md`/`docs/firmware.md`.
- Evite números de consumo sem fonte. Se medir, diga como.

## Estilo

- O texto da interface e da documentação é em português do Brasil, em linguagem direta.
- Comentários explicam o **porquê**, não o óbvio.
- Sem segredos no repositório: `.dev.vars`, `.env` e chaves ficam fora do git.

## Segurança

Achou uma falha (por exemplo, forma de ler ou gravar dados sem a chave)? **Não abra uma issue pública.** Use o recurso de aviso privado de vulnerabilidade do GitHub neste repositório.
