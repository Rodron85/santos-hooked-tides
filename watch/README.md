# Santos Tides ⌚ (Galaxy Watch 3 / Tizen)

App própria para o relógio, **separada** da app do telemóvel (não muda nada nela).
Ligam-se pelo mesmo Worker do Cloudflare e pelo mesmo **código de backup** (SH-XXXX-XXXX-XXXX):
- marés oficiais ADMIRALTY, vento, ondas e avisos: as mesmas fontes do telemóvel;
- capturas registadas no relógio vão para o registo online e aparecem no telemóvel na próxima abertura;
- os ★ locais do telemóvel aparecem no relógio (e um local guardado no relógio aparece no telemóvel).

**Controlo:** rodar a roda = mexer/escolher · toque = confirmar e pôr dados · botão de trás = voltar.

**Ecrãs:** Hoje · Melhores horas · Semana · Alvo (por peixe) · Marés · Lua · Vento e mar · Avisos ·
Peixes do mês (tamanhos mínimos, isco) · Locais · Registar captura · As minhas capturas · Definições.

**Notificações:** 30 min antes de cada melhor hora da semana, e às 8h nos dias de lua cheia e lua nova,
com a data, o estado da maré, as próximas marés (hora e altura), a temperatura, o vento e a lua.

## Instalar no relógio (uma vez, com um PC)
1. No PC instala o **Tizen Studio** (developer.tizen.org). No *Package Manager* instala **Wearable 5.5** e,
   em *Extension SDK*, **Samsung Certificate Extension**.
2. No relógio: *Definições › Sobre o relógio › Software* → toca 5 vezes em *Versão do software*.
   Depois *Definições › Opções de programador* → liga **Depuração** e, se aparecer, **Depuração por Wi-Fi**.
   Liga o relógio ao mesmo Wi-Fi do PC e vê o IP (*Ligações › Wi-Fi › a tua rede*).
3. Tizen Studio › *Tools › Device Manager* → *Remote Device Manager* → **+** → IP do relógio, porta 26101 → liga
   (aceita no relógio).
4. *Tools › Certificate Manager* → **+** → **Samsung** → **Wearable** → cria o certificado com a tua conta Samsung
   (o relógio tem de estar ligado, para entrar o número dele).
5. *File › New › Tizen Project* → *Template* → **Wearable 5.5** → **Web Application** → *Basic UI*, nome `SantosTides`.
   Apaga os ficheiros do projeto novo e copia para lá tudo o que está nesta pasta `watch`
   (config.xml, index.html, icon.png, css, js).
6. Botão direito no projeto → **Run As › Tizen Web Application**. Fica instalada no relógio.
7. No relógio: *Definições › Ligar ao telemóvel* → põe o código que está no telemóvel (*Registo › Backup online*).

## Depois de mudar a app do telemóvel
`python3 watch/tools/extract.py` copia de novo as contas e os dados (marés, lua, peixes, regras, palavras em português)
de `public/index.html` para `watch/js/shared.js`. Só lê o ficheiro do telemóvel, nunca o altera.
