# Montagem 3D: testes e manutenção

Quinto e último guia da série (anterior: [sensores e fiação](montagem-3d-sensores-e-fiacao.md)). Testes de bancada antes de subir no mastro, falhas comuns e manutenção.

> **Status:** os procedimentos descrevem o que se espera do projeto. **Nada foi medido em hardware até agora**; registre os resultados e ajuste. O que falta testar da estação está em [pendencias-de-teste.md](pendencias-de-teste.md).

## Testes de bancada

| # | Teste | Esperado |
|---|---|---|
| 1 | Gire a biruta e o rotor com o dedo | Giram livres, sem raspar nem prender |
| 2 | Balance o conjunto para cima e para baixo | Sem folga axial perceptível |
| 3 | Sopre no rotor | Parte com vento fraco |
| 4 | Gire o rotor com a estação ligada | O contador sobe cerca de 1 pulso por volta |
| 5 | Gire a biruta 360° | O ângulo do GY-273 varia por toda a volta, sem saltos |
| 6 | Gire a biruta com o rotor parado | **Nenhum** pulso do Hall |
| 7 | Gire o rotor com a biruta parada | O ângulo muda no máximo alguns graus |

## Calibração

Direção, norte e fator de velocidade em [calibracao.md](calibracao.md). Em resumo: gire a biruta 360° duas vezes para achar o centro e a escala de X e Y, aponte o indicador N para o norte e registre o *ajuste do norte*. Calibre o fator de velocidade contra um anemômetro de referência.

## Falhas comuns

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| Rotor ou biruta arrasta | Rolamento sujo ou amassado; apoio do eixo acima de 7,95 mm | Lixe o apoio; troque o rolamento; meça o eixo com o paquímetro |
| Rolamento solto no cubo ou no anel | Alojamento folgado (impressão) | Gota de cianoacrilato nas bordas, ou reimprima com compensação menor |
| Rolamento não entra no eixo | Impressão acima de 7,95 mm | Lixa 800 no apoio (veja [impressão](montagem-3d-impressao.md#teste-de-encaixe-do-608zz-faça-primeiro)) |
| Rotor raspa o braço | Braço baixo ou colar torto | Reposicione o colar; a folga prevista é de 1 mm |
| Sem pulsos | Ímã B invertido (A3144), longe ou fio solto | Inverta o ímã; confira a distância (≈ 3 mm) e os fios |
| Sem sinal do GY-273 | Chip HMC5883L (0x1E) ou fios trocados | Confira o chip e SDA/SCL |
| Sinal fraco do GY-273 | Ímã A pequeno, distante, ou blindado pelo rolamento | Ímã maior ou mais perto; faixa ±8 G no firmware |
| Sentido da direção invertido | Placa colada ao contrário | Use `360 − θ` |

### Pulsos falsos no Hall

O ímã A (5×2 mm) pode gerar cerca de 3 G no Hall, e o A3144 só começa a operar perto de 7 G: a margem é pequena. Se a biruta, girando sozinha, produzir pulsos, reduza o ímã A (por exemplo, 4×2 mm) ou aumente a distância.

## Vento mínimo de partida

Ímãs fora do eixo criam um pequeno desequilíbrio, e o atrito do rolamento ZZ define o vento mínimo para o rotor sair do lugar. Se partir tarde demais, confira o rolamento e a folga da arruela antes de qualquer outra coisa.

## Uso externo

- Imprima em PETG ou ASA, em cor clara.
- O projeto é **aberto**: a água entra pelos furos e pelo canal de cabos. Vede o canal da base com silicone, deixe um ponto de escoamento e faça um laço nos cabos antes da entrada (*drip loop*).
- Proteja ímãs, GY-273 e soldas com epóxi ou verniz isolante.
- Em ambiente com pó ou maresia, prefira rolamentos 2RS.

## Manutenção

| Quando | O que fazer |
|---|---|
| A cada 3 a 6 meses | Gire à mão: deve girar livre. Limpe poeira e teias em volta dos rolamentos. |
| Depois de chuva forte | Procure água no bolso do GY-273 e no canal de cabos |
| Giro áspero | Troque o rolamento (puxe pelo anel externo); o apoio do eixo (Ø7,9 mm) precisa estar liso |
| Rolamento seco | Uma gota de óleo leve. **Pouco**: o excesso atrai poeira e emperra no frio |
| Plástico amarelado ou quebradiço | Imprima outra peça: o plástico se degrada ao sol |

Para trocar um rolamento, desmonte na ordem inversa do [passo a passo](montagem-3d-passo-a-passo.md): braço, rotor, arruela e biruta. Os fios do Hall ficam no eixo; ao soltar o braço, trate-os com cuidado.

Voltar ao [índice](README.md#montagem-3d).
