# Estação meteorológica ESP32 — Windicator com sensores de vento

> **Sobre os arquivos 3D:** os `.stl` e `.3mf` não vão para o repositório público porque derivam do Windicator V2.0 "Compact", que tem licença própria. Veja [THIRD_PARTY.md](../THIRD_PARTY.md). Sem eles, gere as peças com os scripts da pasta `fonte/` a partir do modelo original.


Adaptação do **Windicator V2.0 "Compact"** (biruta + anemômetro de copos impressos em 3D) para medir
**direção** e **velocidade** do vento com um ESP32:

| Grandeza | Sensor | Como mede |
|---|---|---|
| Direção | **GY-273** (QMC5883L, magnetômetro 3 eixos, I²C) | Um ímã na biruta gira em volta do eixo; o campo horizontal visto pelo chip gira junto → ângulo por `atan2` |
| Velocidade | **A3144** (sensor Hall digital, TO-92UA) | Um ímã no cubo do rotor passa sob o sensor a cada volta → 1 pulso/volta → `v = k · f` |

> **Status:** projeto de CAD + documentação. **Nada foi impresso nem testado em hardware.**
> Os valores de campo magnético são estimativas (modelo de dipolo) e precisam de validação na bancada.

---

## 1. Conteúdo desta pasta

| Arquivo | O que é |
|---|---|
| `01_montagem_completa.png` | Vista completa: perspectiva + elevação com cotas |
| `02_vista_explodida.png` | Vista explodida numerada (14 itens) com legenda |
| `03_detalhes_cortes.png` | Corte vertical pelo eixo, princípio de cada medição, ligação ao ESP32, lista de compras |
| `04_cotas_montagem_corte.png` | **Cotas:** vista frontal e corte A–A da montagem completa |
| `05_cotas_explodida_corte.png` | **Cotas:** vista explodida em corte, com altura e largura de cada peça |
| `06_cotas_eixo_arruela_indicador.png` | **Cotas:** eixo (com o apoio Ø7,9 do 608ZZ), arruela e indicador N |
| `07_cotas_base.png` | **Cotas:** base, vistas superior e inferior e dois cortes |
| `08_cotas_biruta_rotor_braco.png` | **Cotas:** biruta, rotor de copos e braço do Hall |
| `01_base_com_bolso_GY273.stl` | **Modificada** — base com bolso para o GY-273 e canal de cabos |
| `02_eixo_oco_prolongado.stl` | **Modificada** — eixo aparado, oco, prolongado, com furo lateral (imprimir **em pé**) |
| `03_biruta_com_furo_do_ima.stl` | **Modificada** — biruta (*Tail boom*) com túnel do ímã A |
| `04_rotor_copos_ima_e_furo.stl` | **Modificada** — rotor (*Wings*) com furo no teto e bolso do ímã B |
| `05_braco_do_hall.stl` | **Nova** — braço fixo que segura o A3144 sobre o rotor |
| `06_indicador_N_original.stl` | Original, sem mudança (*North indicator*) |
| `07_arruela_original.stl` | Original, sem mudança (*Spacer washer*) |
| `Windicator_sensores_placa.3mf` | As 7 peças acima numa placa, com nomes (abrir no Bambu Studio/PrusaSlicer) |
| `exemplo_esp32.ino` | Exemplo de firmware (não testado) |
| `fonte/` | Scripts Python que geram tudo (ver §9) + o `.3mf` original do autor |

Peças originais **não usadas**: *Base for vertical surfaces* (suporte de parede). Pode ser usada como
alternativa de fixação, mas não tem o bolso do sensor.

Guias de montagem em português: [peças e materiais](../docs/montagem-3d-pecas-e-materiais.md) ·
[impressão](../docs/montagem-3d-impressao.md) · [montagem mecânica](../docs/montagem-3d-passo-a-passo.md) ·
[sensores e fiação](../docs/montagem-3d-sensores-e-fiacao.md) · [testes e manutenção](../docs/montagem-3d-testes-e-manutencao.md).

---

## 2. Origem e mecanismo original

O `.3mf` do autor contém 7 objetos (mesmas malhas do STL) e **fotos do modelo montado**, que mostram o
mecanismo real:

- **Eixo fixo** (*Shaft*, Ø13,6 embaixo / Ø8,25 em cima, 46 mm) preso no tubo da base (furo Ø13,5).
- **Dois rolamentos 608ZZ (8×22×7 mm)**: um no anel da biruta, outro no cubo do rotor. (A versão anterior
  desta adaptação supunha 627ZZ, de 7 mm de furo; o eixo original, de Ø8,25 em cima, e a arruela, de furo Ø8,2,
  já eram de 8 mm. O 608ZZ tem o mesmo diâmetro externo e a mesma largura, então os alojamentos não mudam.) Entre eles, a **arruela espaçadora** (Ø11,1 × 1,9 mm).
- Biruta e rotor ficam **empilhados** no eixo (anel da biruta z 29–38, cubo do rotor z 38,4–47,4). A aleta
  da biruta fica fora do círculo varrido pelos copos (raio > 91 mm), então não há colisão.
- O **indicador N** é um aro (ID 13,6) que se apoia no topo do tubo e aponta o norte.

Pilha original (alturas em mm, referência = face de baixo da base):

```
z 88,4  ── topo dos copos
z 47,4  ── topo do cubo do rotor         (teto de 1 mm; bolso de 8 mm)
z 45,9  ── topo do rolamento nº2 (z 38,9–45,9)
z 38,9  ── arruela termina (z 37–38,9)
z 37    ── rolamento nº1 (z 30–37) / anel da biruta z 29–38 (lábio de 1 mm em z 29–30)
z 30    ── ressalto do eixo (Ø13,6 → Ø8,25 no original; Ø7,9 aqui)
z 20,1  ── topo do tubo; indicador N (z 20,1–23,1)
z 5     ── placa da base (Ø50)
z 0
```

---

## 3. Modificações (v2)

| Peça | Mudança | Por quê |
|---|---|---|
| **Base** | Furo fechado abaixo de z=5 (piso do furo); bolso 19,4 × 14,8 × 3,4 mm sob a placa; canal 6 × 3,4 mm até a borda (−Y); passa-fios Ø3,6 do bolso ao furo | Aloja o GY-273 no eixo; cabos saem pela lateral; fios do Hall chegam por dentro do eixo |
| **Eixo** | Aparado em z=5 (assenta no piso do furo); **apoio dos rolamentos (z 30 a 46) reduzido de Ø8,25 para Ø7,9 mm (608ZZ)**; prolongado até z=53,4 (Ø7); furo axial Ø3,2; furo lateral Ø3,0 em z=51,2 | Passar os fios do A3144 por dentro; prender o braço do Hall |
| **Biruta** | Túnel Ø5,3 horizontal (lado oposto à aleta, z local 4,5, de r=12,7 até a borda) | Aloja o ímã A (5×2 mm); lábio e bolso do rolamento mantidos |
| **Rotor** | Furo Ø7,5 no teto; bolso Ø4,3 × 1,2 mm no topo do cubo em r = 15 mm | O eixo passa pelo teto; aloja o ímã B (4×1 mm) |
| **Braço do Hall** (nova) | Colar Ø12 prensado no topo do eixo; barra de 19,5 mm a 1 mm acima do cubo; bolso aberto no topo p/ o A3144; canal e janela até o furo lateral do eixo | Mantém o A3144 fixo (não gira) sobre o ímã B |

Premissa de projeto: os fios do A3144 descem **por dentro do eixo**, pois o rotor gira em volta dele.

---

## 4. Lista de materiais

**Comprar**

| Qtde | Item | Obs. |
|---|---|---|
| 2 | Rolamento **608ZZ** (8×22×7 mm) | o comum de patins e *spinners*; prefira blindagem metálica (ZZ) ou 2RS |
| 1 | **GY-273** (QMC5883L) | |
| 1 | **A3144** (TO-92UA) | |
| 1 | Ímã neodímio **5×2 mm** (ímã A, biruta) | radial |
| 1 | Ímã neodímio **4×1 mm** (ímã B, rotor) | vertical |
| 1 | Resistor 10 kΩ | pull-up da saída do A3144 |
| ~0,5 m | Fio 28 AWG (≥ 7 condutores) | 4 do GY-273 + 3 do A3144 |
| — | Epóxi/cola, fita Kapton | fixar ímãs, placa e sensor |
| 3 | Parafusos M4 | fixação da base (furos Ø5 a 17,5 mm) |

**Imprimir** (sugestão: PETG ou ASA para uso externo; PLA só para teste)

| Peça | Orientação | Observação |
|---|---|---|
| 01 base | face da placa na mesa | o bolso abre para a mesa; teto do bolso é **ponte de ~19 mm** — use suporte se afundar |
| 02 eixo | **em pé** | furo lateral de 3 mm é ponte curta |
| 03 biruta, 04 rotor | como no original (placa deitada) | o rotor tem suportes nos copos (ver o original do autor) |
| 05 braço | colar para cima | |
| 06, 07 | como no original | |

---

## 5. Montagem

1. **GY-273:** solde os 4 fios (VCC, GND, SDA, SCL) direto nos pads (sem barra de pinos), componentes
   para cima. Cole no bolso da base e passe os fios pelo canal (−Y).
2. **Eixo:** empurre o eixo no furo da base até o piso (z = 5). O furo axial do eixo e o passa-fios da base ficam alinhados com o bolso do GY-273 (os fios do A3144 serão passados no passo 9).
3. **Indicador N:** encaixe o aro no eixo, apoiado no tubo (z 20,1).
4. **Biruta:** pressione o rolamento nº1 no anel (apoia no lábio) e encaixe no eixo sobre o ressalto.
5. **Ímã A:** coloque no túnel com a face **S voltada ao eixo**; cole e feche o túnel com epóxi.
6. **Arruela** sobre o eixo.
7. **Rotor:** pressione o rolamento nº2 no cubo e encaixe no eixo (o topo do eixo passa pelo furo do teto).
8. **Ímã B:** no bolso do topo do cubo, face **S para cima**, rente à superfície; cole.
9. **A3144 e braço:** solde 3 fios (VCC, GND, OUT) nos terminais do A3144 e isole. Passe os 3 fios **de baixo para cima**:
   do bolso da base, pelo passa-fios e pelo furo axial do eixo, até saírem pelo **furo lateral** (z≈51). Encaixe o braço
   no topo do eixo (colar prensado), passando os fios pela **janela** do colar e pelo **canal** da barra até o bolso;
   assente o A3144 no bolso (**face marcada para baixo**, terminais voltados para o colar) e cole. Cubra o canal com
   fita. O A3144 é fixo; é o ímã B (no cubo) que passa sob ele a cada volta.
10. Confira: biruta e rotor giram livres; o rotor não toca o braço (folga de 1 mm).

---

## 6. Ligação ao ESP32

| Sensor | Pino sensor | ESP32 |
|---|---|---|
| GY-273 | VCC | 3V3 |
| | GND | GND |
| | SDA | GPIO 21 |
| | SCL | GPIO 22 |
| A3144 | VCC | **5 V (VIN)** |
| | GND | GND |
| | OUT | GPIO 27 **e** resistor 10 kΩ para 3V3 |

- O GY-273 tem endereço fixo I²C **0x0D** e é o único no barramento (sem conflito).
- O A3144 (4,5–24 V) só é **garantido a 5 V**; a 3,3 V está fora da especificação. Com o pull-up em 3,3 V,
  o sinal que chega ao GPIO fica seguro para o ESP32.
- Comprimento: ≤ 1 m de cabo para o I²C (aumente com cuidado/menor velocidade, ou use um conversor).

---

## 7. Como funcionam as medições e a calibração

### Direção (GY-273)
- O ímã A (5×2 mm, radial, a r = 12,7 mm do eixo, z = 33,5) gira com a biruta. O chip fica ~31 mm abaixo,
  quase no eixo (distância ρ ≈ 34 mm). O campo **horizontal** no chip gira uma volta por volta da biruta
  (≈ 0,5 G estimado; os rolamentos de aço podem reduzir). A placa está deitada, então use os eixos **X e Y**.
- O ímã fica no lado **oposto à aleta**, ou seja, do lado do bico: o ângulo do ímã é o ângulo de **onde o
  vento vem**.
- `θ = atan2(By − cy, Bx − cx)`. Calibração: gire a biruta 360° (2×), guarde mín./máx. de X e Y, centro
  `(cx, cy)` = ponto médio e escala para igualar os raios (hard-iron/soft-iron simples).
- Alinhe o indicador N para o norte, leia o ângulo e guarde como `OFFSET_N`. O sentido (horário/anti-horário)
  depende de como a placa foi colada: se estiver invertido, use `360 − θ`.
- Faixa do QMC5883L: ±2 G (mais sensível) ou ±8 G. Se saturar, passe para ±8 G, afaste ou reduza o ímã.

### Velocidade (A3144)
- Ímã B 4×1 mm (face S para cima) a ~3 mm do A3144: ordem de centenas de G (≫ 35 G, limite de operação
  garantido). O A3144 liga **somente com polo sul** na face marcada; se não disparar, inverta o ímã.
- 1 pulso por volta. Interrupção na **borda de descida** com filtro de ~1 ms.
- `f = pulsos/s`, `v = k · f`. Estimativa inicial: copos a ~67 mm do eixo → circunferência ~0,42 m; a
  velocidade tangencial dos copos é ~30–40 % da do vento; **calibre k** contra um anemômetro de referência.
  Ordem de grandeza: 10 m/s ≈ 8 voltas/s.
- Para mais resolução em vento fraco, adicione 2–4 ímãs no cubo (k muda proporcionalmente).

### Interferência entre os sensores
- Ímã A (5×2) → A3144: ≈ 3 G no máximo (limiar de operação do A3144 começa em ~7 G): margem pequena.
  **Teste:** gire a biruta com o rotor parado; não deve haver pulsos. Se houver, reduza o ímã A (ex.: 4×2).
- Ímã B (4×1) → GY-273: desprezível (~45 mm de distância).

---

## 8. Riscos e validações pendentes

1. **Rolamento:** o 608ZZ é a escolha deste projeto (eixo Ø7,9 para o furo de 8 mm). O encaixe depende da impressora: imprima só o eixo e prove um rolamento antes de imprimir o resto (veja [o guia de impressão](../docs/montagem-3d-impressao.md)).
2. **Tolerâncias de impressão:** furos Ø23,4/Ø22 (rolamentos), eixo Ø7,9 (apoio do rolamento), Ø13,5 (furo da base), Ø3 (fios) dependem da
   impressora; ajuste na primeira peça.
3. **Sinal do GY-273:** campo estimado ≈ 0,5 G; depende da posição real do chip na placa (assumi ao centro)
   e da blindagem dos rolamentos.
4. **Falsos pulsos do A3144** causados pelo ímã A (ver §7).
5. **Estanqueidade:** projeto aberto; para uso externo prever vedação dos furos/cabos e fixação contra UV/água.
6. **Peso/equilíbrio:** ímãs deslocados do eixo criam pequeno desequilíbrio; os ímãs são leves, mas observe a
   velocidade mínima de partida.

---

## 9. Reprodução (scripts)

Pasta `fonte/` (Python 3.12). Dependências: `numpy trimesh manifold3d pymeshfix pyvista vtk matplotlib shapely mapbox-earcut rtree`.

| Script | Função |
|---|---|
| `build2.py` | Lê o `.3mf` do autor, aplica as modificações e grava os STL (e `parts2.pkl`, temporário) |
| `scene2.py` | Monta a cena (peças, ímãs, sensores, fios), explosão e cortes; renderização com PyVista |
| `f1.py`, `f2.py`, `f3.py` | Geram `01_…png`, `02_…png`, `03_…png` |
| `cotas_lib.py`, `g1.py` … `g5.py` | Geram as cinco imagens com cotas (`04_…` a `08_…`) direto das malhas, em corte e silhueta (matplotlib e shapely) |
| `make_placa.py` | Monta `Windicator_sensores_placa.3mf` a partir dos STL |

```bash
cd fonte
python build2.py     # gera os STL na pasta acima
python make_placa.py # monta a placa .3mf
python f1.py && python f2.py && python f3.py
python g1.py && python g2.py && python g3.py && python g4.py && python g5.py   # imagens com cotas
```

Parâmetros principais (início de `build2.py`): alturas da pilha (`Z_*`), rolamento (`BRG_*`) e apoio do eixo (`SEAT_*`), tamanhos dos ímãs (`MAGA_*`,
`MAGB_*`), raio do sensor Hall (`XSENS`), bolso do GY-273 (`POCKET_*`), extensão do eixo (`SHAFT_*`).
Cada peça é gerada por operações booleanas (manifold3d); as peças originais vêm do `.3mf`.

---

## 10. Créditos

Projeto original: **Windicator V2.0 "Compact"** (autor do `.3mf`/STL, `fonte/Windicator_V2.0_Compact.3mf`).
Esta adaptação (sensores, base, eixo, braço do Hall, documentação) foi feita sobre as malhas originais;
respeite a licença do projeto original ao publicar ou compartilhar.
