# Guia: colocar uma estação nova no ar

Passo a passo para quem tem um **ESP32-C3 novo** e quer vê-lo enviando dados no site. Não precisa instalar nada no computador além do navegador. Se você já montou a parte física (sensores, bateria), este guia leva da placa "em branco" até a primeira leitura no mapa.

> As telas abaixo são do site rodando em modo de desenvolvimento, com as estações de exemplo. As telas do aviso "Placa USB detectada" foram tiradas com uma placa simulada, mas o texto e os botões são os reais.

**Tempo estimado:** 10 a 15 minutos, mais o tempo de gravar o firmware.

---

## 0. Antes de começar

Separe estas coisas. A maioria dos problemas vem de faltar uma delas.

| O que | Por quê |
|---|---|
| **Navegador Chrome, Edge ou Opera** no computador | Só eles falam com a placa pela USB (Web Serial). Firefox e Safari não servem. |
| **Cabo USB de dados** | Muitos cabos só carregam e não transmitem dados. Se o computador não "enxerga" a placa, troque o cabo. |
| **Rede Wi-Fi de 2,4 GHz**, o nome e a senha | O ESP32-C3 **não conecta em 5 GHz**. Se o seu roteador junta as duas redes no mesmo nome, crie uma rede 2,4 GHz separada para teste. |
| **Token de administrador** | É a "senha" que o site pede para criar e configurar estações. Veja a seção abaixo. |
| **O site no ar** e **alcançável pela placa** | A placa precisa conseguir abrir o endereço do site pela rede Wi-Fi dela. Veja a seção "Que endereço a placa vai usar?". |

### Qual é o token de administrador?

É o valor do segredo `ADMIN_TOKEN` do servidor (Worker). **O site nunca o mostra**, porque ele só é usado para assinar os pedidos.

| Onde o site está rodando | Qual é o token |
|---|---|
| **No seu computador** (`npm run dev` na pasta `worker`) | O que está em `worker/.dev.vars`, na linha `ADMIN_TOKEN=`. O modelo traz `admin-troque`. |
| **Publicado na Cloudflare** | O que você definiu ao publicar, com `npx wrangler secret put ADMIN_TOKEN`. Ele **não pode ser lido de volta**. Se esqueceu, defina outro com o mesmo comando. |

O token digitado fica guardado só neste navegador, e é pedido uma vez.

### Que endereço a placa vai usar?

A placa guarda o endereço do site e envia as leituras para ele. O endereço certo depende de onde o site está:

| Situação | Endereço | Observação |
|---|---|---|
| Site publicado | `https://estacao-meteo.SEU-USUARIO.workers.dev` | O caso normal. Funciona de qualquer rede. |
| Teste no seu computador | `http://IP-DO-COMPUTADOR:8787`, por exemplo `http://192.168.1.2:8787` | O computador e a placa precisam estar **na mesma rede**. **`localhost` não serve**: para a placa, `localhost` é ela mesma. |

Para o teste local, suba a API aberta para a rede (`npm run dev:lan` na pasta `worker`). Na primeira vez o **firewall do Windows** pergunta se o Node/workerd pode usar a rede privada: **permita**. Para descobrir o IP do computador, rode `ipconfig` e olhe o "Endereço IPv4" do Wi-Fi.

Com `http://` a placa **assina** os envios e a chave não viaja, mas o conteúdo das leituras fica legível na rede. Para uso de verdade, prefira `https://`.

---

## 1. Conheça o site

Abra o site. A primeira tela é o **mapa da rede**: cada ponto é uma estação, com a leitura do momento. Estações que não enviam há um tempo aparecem como **sem sinal**.

![Mapa da rede de estações](img/guia/01-mapa.png)

Ao abrir, o mapa vai para a **sua localização** (o navegador pede permissão; se negar, ele mostra as estações). O botão de camadas, no canto direito, troca o mapa de fundo entre **Escuro, Ruas, Satélite e Relevo**, e o botão de alvo, embaixo, volta para onde você está.

![Opções de camadas do mapa](img/guia/13-camadas-do-mapa.png)

Os botões do topo (**Vento, Temperatura, Chuva 24 h, Bateria, Última vez visto**) podem ser ligados **todos ao mesmo tempo**: cada estação mostra uma linha por camada ligada.

![Todas as camadas ligadas](img/guia/20-camadas-todas.png)

Para **editar ou remover** uma estação, clique no pino dela e depois em **Editar ou remover estação**. Remover apaga a estação, a chave e todas as leituras.

Os três lugares que você vai usar:

- **Adicionar estação** (botão no mapa): cria a estação e gera um código de pareamento.
- **Ajustes** (no topo): gravar firmware, autorizar a placa USB, alertas.
- **Configurações** (dentro da página de cada estação): bateria, energia, intervalo de envio, calibração.

---

## 2. Escolha o caminho

Há três jeitos de configurar a placa. Use o **Caminho A** se for a primeira vez: é o mais curto e o que dá menos erro.

| Caminho | Quando usar | Precisa de |
|---|---|---|
| **A. Pela USB** (recomendado) | A placa está ao lado do computador. | Cabo USB, Chrome/Edge/Opera, firmware com USB. |
| **B. Código de pareamento** | A placa vai para outra pessoa instalar em outro lugar. | Site em `https://`, placa já gravada. |
| **C. Portal do celular** | Nada acima funcionou. | Celular. |

---

## 3. Caminho A: pela USB (recomendado)

### 3.1 Gravar o firmware (só numa placa nova)

Plugue a placa no computador e abra **Ajustes → Gravar firmware**.

![Painel Gravar firmware em Ajustes](img/guia/05-ajustes-gravar-firmware.png)

1. Clique em **Escolher a placa**. O navegador abre uma janelinha com as portas seriais: escolha a que aparece ao plugar o cabo (algo como "USB JTAG/serial" ou "CP210x") e clique em **Conectar**.
2. Em **Imagem** há uma só: o mesmo firmware serve para a bancada e para o campo. Com o cabo no computador, o site reconhece e configura a placa; sem o cabo (bateria, painel solar), ela segue o ciclo de baixo consumo.
3. Clique em **Gravar firmware** e espere chegar a 100%. **Não desligue a placa nem feche a aba.**
4. A placa reinicia sozinha.

Você vê, abaixo do nome de cada imagem, o **site embutido** (por exemplo `http://192.168.1.2:8787`). É o endereço que a placa vai usar. Se estiver errado, veja o final deste guia.

> Se aparecer a mensagem de que não foi possível conectar, veja "A gravação falha" em *Problemas comuns*.

Se a placa já veio com o firmware, **pule para 3.2**.

### 3.2 O aviso "Placa USB detectada"

Com o site aberto no navegador, plugue a placa. Na primeira vez, é preciso autorizá-la: vá em **Ajustes → Placa USB** e clique em **Autorizar uma placa**.

![Painel Placa USB em Ajustes](img/guia/04-ajustes-placa-usb.png)

Depois de autorizada, a placa é reconhecida sozinha toda vez que você plugar o cabo. Aparece um aviso no canto inferior direito. Há três situações:

**a) "Procurando o firmware da estação…"**: a placa tem alguns segundos depois de ligar para responder. Aguarde.

Depois de reconhecida, **pode levar o tempo que precisar** para preencher o formulário: o site mantém a placa escutando sozinho e, se ela se perder, reinicia e reconecta por conta própria.

**b) "conectada, mas ainda sem o firmware da estação"**: a placa está lá, mas sem o nosso firmware (ou ele não respondeu a tempo). Clique em **Gravar o firmware agora**, ou refaça o passo 3.1.

![Placa sem firmware](img/guia/06-placa-sem-firmware.png)

Dentro de **Já gravei e não reconheceu** estão as três causas mais comuns: a placa só escuta nos primeiros 10 s depois de ligar (aperte RESET ou replugue), e outro programa (monitor serial, IDE) pode estar com a porta.

**c) "ESP32-C3 · firmware 0.2.0"**: reconhecida. É aqui que se configura.

![Placa detectada e pronta para configurar](img/guia/07-placa-detectada.png)

A segunda linha diz **"Placa nova, ainda sem configuração."**. Se a placa já foi configurada antes, aparece "Reconhecida: estação X" e o botão **Configurar de novo**.

### 3.3 Configurar a placa

Preencha o formulário do aviso:

![Formulário de configuração da placa](img/guia/08-configurar-placa.png)

| Campo | O que colocar |
|---|---|
| **Estação** | Escolha uma estação que já existe, ou **Nova estação…** para criar uma agora. |
| **Nome / Latitude / Longitude** | Só para estação nova. Clique em **No mapa**: o aviso some, o site volta ao mapa e você clica no local da estação. O aviso reaparece com as coordenadas preenchidas e o resto do formulário intacto. Também dá para digitar as coordenadas. Dá para ajustar depois. |
| **Rede Wi-Fi (2,4 GHz)** | A lista vem **da própria placa**, com o sinal em dBm (quanto mais perto de zero, melhor: -50 é ótimo, -80 é fraco). Escolha a rede. Se nenhuma aparecer, digite o nome. |
| **Senha do Wi-Fi** | A senha da rede escolhida. Sem espaço sobrando no começo ou no fim. |
| **Token de administrador** | O token da seção 0. Só aparece se este navegador ainda não o conhece. |
| **Avançado → Endereço do site** | O endereço que a placa vai usar. Normalmente já vem certo. Confira com a tabela da seção 0. |

Clique em **Criar a estação e configurar a placa** (ou **Configurar esta placa**, se a estação já existia).

O que acontece por baixo: o site **gera uma chave nova**, entrega direto à placa pelo cabo e ela reinicia. Ninguém precisa copiar chave nenhuma.

### 3.4 Esperar a primeira leitura

Aparece **"Quase pronto"**. A placa reinicia, conecta no Wi-Fi e manda a primeira leitura. Leva de **10 a 60 segundos**.

![Aguardando a primeira leitura](img/guia/09-aguardando-primeira-leitura.png)

Quando a leitura chega, o aviso muda para **"Estação no ar"**:

![Estação no ar](img/guia/10-estacao-no-ar.png)

Clique em **Abrir a estação**.

### 3.5 A página da estação

![Página de uma estação](img/guia/11-pagina-da-estacao.png)

Mostra vento, temperatura, umidade, pressão, chuva e bateria, com os gráficos das últimas horas. Se aparecer "ainda não enviou leituras", espere o intervalo configurado (10 min por padrão) ou veja *Problemas comuns*.

**Pronto.** A partir daqui, o resto é opcional.

---

## 4. Caminho B: código de pareamento

Serve para mandar a placa a outra pessoa instalar, sem ela precisar de computador, token ou chave. **Só funciona com o site em `https://`**, porque a chave viaja na resposta.

1. **Você**, uma vez, grava a placa com a imagem **Campo** (passo 3.1) e a envia.
2. **Você** clica em **Adicionar estação** no mapa:

   ![Formulário Adicionar estação](img/guia/02-adicionar-estacao.png)

   Preencha nome, cidade, local, bateria (tipo e capacidade em mAh) e o token. Clique em **Criar estação**.
3. O site mostra o **código de pareamento**:

   ![Código de pareamento](img/guia/03-codigo-pareamento.png)

   O código vale **24 horas** e **uma vez só**, e gerar outro cancela o anterior. **Copiar instruções** copia um texto pronto para mandar a quem instala.
4. **Quem instala**: liga a placa, abre o Wi-Fi **EstacaoMeteo-XXXX** no celular, escolhe a rede do local, digita o código e salva.
5. A placa troca o código pela chave, e a estação aparece no site.

Para gerar outro código numa estação que já existe: página da estação → **Configurações → Gerar código de pareamento**.

---

## 5. Caminho C: portal do celular

Use se a USB não funcionou.

1. Ligue a placa **com bateria ou carregador, sem o cabo num computador** (com o cabo, ela espera a configuração pelo site). Sem Wi-Fi salvo, ela cria a rede **EstacaoMeteo-XXXX**. Se já tinha Wi-Fi salvo, **segure o botão BOOT** (GPIO9) enquanto liga.
2. No celular, conecte nessa rede. Uma página de configuração abre sozinha (se não abrir, vá a `192.168.4.1`).
3. Escolha o Wi-Fi e a senha, informe o **endereço do site** e o **código de pareamento** (ou, à mão, o **ID** e a **chave do dispositivo**).
4. Salve. A placa mede, envia a primeira leitura e passa a seguir a rotina.

---

## 6. Depois que está no ar

Na página da estação, o botão **Configurações** abre a parte técnica:

![Configurações da estação](img/guia/12-configuracoes-da-estacao.png)

O que vale ajustar logo no começo, na seção **Configuração**:

| Ajuste | Para quê |
|---|---|
| **Enviar a cada** = 1 | Só durante os testes: a estação envia a cada leitura, e as mudanças feitas no site chegam mais rápido. Depois volte ao padrão (3) para economizar bateria. |
| **Tipo e capacidade da bateria** | Define a curva de % da bateria e a autonomia estimada. |
| **Chuva por basculada** | Medido no seu pluviômetro. Veja [calibracao.md](calibracao.md). |
| **Ajuste do norte** | Para a direção do vento. Veja [calibracao.md](calibracao.md). |
| **Modo bancada** | Só em teste. Em campo, ponha 0. |

As mudanças ficam **pendentes** até a estação enviar de novo e confirmar. Não é erro, é só esperar.

---

## 7. Problemas comuns

Resumo do que mais acontece. A lista completa está em [solucao-de-problemas.md](solucao-de-problemas.md).

### "Token de administrador incorreto."

É o erro mais comum e tem 3 causas:

1. **Token digitado diferente do segredo do servidor.** Em desenvolvimento, confira `worker/.dev.vars`. Publicado, redefina com `npx wrangler secret put ADMIN_TOKEN`.
2. **O servidor não foi reiniciado** depois de mudar o `.dev.vars`. Ele só lê o arquivo ao iniciar.
3. **O relógio do computador está errado.** O pedido é assinado com a hora e é recusado se a diferença passar de 2 minutos. Sincronize a hora do Windows.

Se um token errado ficou guardado no navegador, abra **Avançado → trocar o token de administrador** no aviso da placa e digite de novo.

### O aviso da placa não aparece

- O navegador é Chrome, Edge ou Opera? Em Firefox/Safari não funciona.
- O site está em `https://` ou `localhost`? A Web Serial não funciona em `http://` com IP. Para o teste local, abra o site por `http://localhost:5173`.
- A placa foi autorizada em **Ajustes → Placa USB**?
- O cabo é de dados? Tente outro.
- Outro programa está usando a porta (monitor serial do PlatformIO, Arduino IDE)? Feche.

### A gravação falha ao conectar

Troque o cabo, feche programas que usam a porta e tente de novo. Em placas com ponte CH340/CP210x: segure **BOOT**, aperte **RESET**, solte o RESET e depois o BOOT. A USB nativa do ESP32-C3 entra em modo de gravação sozinha.

### A placa foi configurada mas nunca chega a leitura

| Sintoma | Causa mais provável |
|---|---|
| Passa de 2 minutos em "Quase pronto" | Senha do Wi-Fi errada, ou rede de **5 GHz**. |
| Conecta mas não envia | A placa **não alcança o endereço do site**. Em teste local, confira o IP, se o `dev:lan` está rodando e se o firewall do Windows liberou o Node/workerd. |
| Estação aparece como "atrasada" | Já passou de 2,5 intervalos sem leitura. Com envio em lote, o intervalo efetivo é `intervalo × enviar a cada`. |

### O endereço do site gravado na placa está errado

Em **Avançado → Endereço do site**, corrija e configure a placa de novo (o aviso tem o botão **Configurar de novo**). Para mudar o endereço embutido nas imagens de fábrica, gere-as de novo com `python tools/make_factory.py --server https://seu-site` (veja [firmware.md](firmware.md)).

### Perdi a chave / quero recomeçar a placa

Configure de novo pelo aviso (3.3): isso **gera uma chave nova** e invalida a anterior. Para limpar tudo na placa, marque **Apagar toda a flash antes** ao gravar (remove Wi-Fi, chave e calibração).

---

## 8. Próximos passos

- [hardware.md](hardware.md): ligações e montagem física
- [calibracao.md](calibracao.md): direção, velocidade, chuva
- [energia.md](energia.md): consumo e autonomia
- [firmware.md](firmware.md): como a placa funciona por dentro
- [implantacao.md](implantacao.md): publicar o site na Cloudflare
