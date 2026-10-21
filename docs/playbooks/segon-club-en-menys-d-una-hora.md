# Guió manual: un segon club en menys d'una hora (T-17-12)

Objectiu (VISIO §5, S17 §1): l'equip AgilityHub posa en marxa un club nou des de la consola D19,
sense codi ni desplegament, en menys d'una hora. Aquest guió és el pas a pas d'una persona de
l'equip. La prova `e2e/core/e10-core.spec.ts` › «a second club in under an hour» el segueix pas per
pas contra el core real (E10-W02).

Les dades d'aquest guió són fictícies: el club «Club Agility Riu Blau» i els seus hosts
`app.riublau.example.test` i `admin.riublau.example.test`. Per a un club de veritat es fan servir
les seves dades.

## Abans de començar (no compta dins l'hora)

Cal tenir a mà:

- **Identitat:** nom, nom legal, població que es mostra, NIF, adreça, correu de contacte i web.
- **Localització:** idiomes, idioma predeterminat, fus horari, moneda i perfil de país.
- **Mòduls:** quins farà servir el club (Complet, Mínim o com el club pilot).
- **Marca:**
  - el color principal i el color del text que hi va a sobre (contrast AA, 4,5:1);
  - el logo en PNG o SVG.
- **Dominis:**
  - el host de l'app dels abonats (`app.…`) i el del backoffice (`admin.…`);
  - accés al proveïdor de DNS del domini del club.
- **Domiciliació SEPA:** nom del creditor, identificador de creditor, sufix i IBAN.
- **Legal:**
  - l'URL de la política de privacitat;
  - el text de consentiment d'imatge, com a mínim en l'idioma predeterminat del club.
- **Primer administrador:** correu i nom.

## Els passos

La columna «Estimació» és el temps d'una persona que ja té les dades a mà. La columna «Passada
manual» és per anotar els temps reals la primera vegada que l'equip faci el guió.

| # | Pas | Què es fa (consola D19, `/consola/clubs`) | Resultat esperat | Estimació | Passada manual |
|---|---|---|---|---|---|
| 1 | Entra a la consola | AgilityHub ID → «Consola de clubs» → [OBRE LA CONSOLA]. Avui, des del backoffice d'un club, amb un compte que té el rol de plataforma (vegeu «Limitacions d'avui», 1). | La llista «Consola de clubs». | 1 min | |
| 2 | Assistent «Nou club» | [Nou club] i els vuit passos: Identitat, Localització, Mòduls, Pagaments (es pot deixar per més tard), Tema («Colors del club»), Catàlegs base (el club plantilla), Primer administrador i Revisió. Després, [CREA EL CLUB]. | La fitxa del club «En posada en marxa», amb la checklist d'onboarding. El primer administrador rep la invitació (N-53). | 10 min | |
| 3 | Dominis | Pestanya Dominis. [Afegeix domini] per a l'app dels abonats i per al backoffice. Al proveïdor de DNS es crea el CNAME que indica la consola (o el TXT). Després, [Verifica] a cada domini. | Els dos dominis «verificat» i «principal». L'app del club s'obre al seu host. | 10 min, més la propagació del DNS | |
| 4 | Tema | Pestanya Tema: [Tria una imatge] per al logo (i la marca, si n'hi ha), amb la previsualització en viu i el contrast AA. Després, [DESA]. | «Canvis desats.» i, a la checklist, «Marca: logo i colors propis» fet. | 3 min | |
| 5 | Pagaments | Pestanya Pagaments › Domiciliació SEPA: el creditor, l'identificador, el sufix i l'IBAN. Després, [DESA]. | «configurat» i «Proveïdor de pagament configurat» fet. L'IBAN no es torna a mostrar. | 4 min | |
| 6 | Legal | Pestanya Legal: l'URL de privacitat i el text de consentiment d'imatge en l'idioma predeterminat (i en els altres, si es té). Després, [DESA]. | «Canvis desats.» i «Política de privacitat» fet. | 3 min | |
| 7 | Catàlegs base | Pestanya Catàlegs base: el club plantilla i les parts. Després, [Clona d'un club plantilla]. | «S'ha copiat: …», amb els avisos d'idioma si n'hi ha. Avui el club plantilla és buit (vegeu «Limitacions d'avui», 2). | 2 min | |
| 8 | Primer administrador | L'administrador obre l'enllaç de la invitació. A AgilityHub ID tria una contrasenya («Canvia la contrasenya»). Després entra al backoffice del club, al seu domini. La pestanya Equip el mostra. | El tauler (D1) del club amb el seu tema, i «Primer administrador amb accés» fet. | 5 min | |
| 9 | Revisió de la fitxa | Pestanyes Identitat, Localització, Mòduls, Paràmetres, Processos, Auditoria i Ús. | Cap error de càrrega. | 5 min | |
| 10 | Checklist i activació | Fitxa: la checklist. Pestanya Estat → [Activa el club]. L'activació és sempre manual (R-17-06), i es pot fer amb punts pendents. | «S'ha canviat l'estat del club.» i l'estat «Actiu». | 2 min | |
| 11 | L'app dels abonats | El host de l'app del club, a `/entrar`. | El logo, els colors i el nom del club. | 2 min | |
| | **Total** | | | **≈ 47 min**, més la propagació del DNS | |

## La passada de la prova contra el core (21-10-2026, 21:42)

La prova fa els onze passos contra el core publicat. Fa servir un DNS fals per al pas 3
(`POST /api/v1/test/dns`, només als perfils `local` i `test`) i hi ha prou llocs locals per a cada
host. Són temps de màquina: demostren que el camí funciona sencer amb el core, no el temps d'una
persona. Fitxer de la passada: `roadmap/evidence/E10-W02/e10w02-segon-club-temps.json`, i el
seu registre, `roadmap/evidence/E10-W02/36-e2e-core-e10-final.log`.

| # | Pas | Segons |
|---|---|---|
| 1 | Entra a la consola | 1,6 |
| 2 | Assistent «Nou club» | 0,9 |
| 3 | Dominis: afegeix i verifica | 0,5 |
| 4 | Tema: logo | 0,4 |
| 5 | Pagaments: SEPA | 0,2 |
| 6 | Legal: privacitat i consentiment d'imatge | 0,2 |
| 7 | Catàlegs base: clona de la plantilla | 0,2 |
| 8 | Primer administrador: invitació i primer accés | 2,1 |
| 9 | Revisió de la fitxa | 1,1 |
| 10 | Checklist i activació | 0,9 |
| 11 | L'app dels abonats al domini del club | 0,3 |
| | **Total** | **8** |

La checklist abans d'activar: `dns`, `sepa`, `branding`, `legal` i `firstAdmin` fets;
`templates` i `faq` pendents (vegeu «Limitacions d'avui», 2).

Les captures de la passada són a `roadmap/evidence/E10-W02/`:

- `core-W02-01-assistent-identitat-1280.png`, `core-W02-02-assistent-tema-1280.png` i
  `core-W02-03-assistent-revisio-1280.png`: l'assistent.
- `core-W02-04-fitxa-creada-1280.png`: la fitxa amb la checklist, just creada.
- `core-W02-05-dominis-verificats-1280.png` i `core-W02-06-tema-1280.png`.
- `core-W02-07-pagaments-1280.png`, `core-W02-08-legal-1280.png` i
  `core-W02-09-catalegs-1280.png`.
- `core-W02-10-equip-1280.png`, `core-W02-11-primer-admin-contrasenya-1280.png` i
  `core-W02-12-primer-admin-tauler-1280.png`: el primer administrador.
- `core-W02-13-checklist-1280.png` i `core-W02-14-estat-actiu-1280.png`.
- `core-W02-15-app-abonats-entrar-375.png`: l'app dels abonats.

## Limitacions d'avui (21-10-2026)

1. **L'entrada a la consola pel host de producte.** El core respon `404 UNKNOWN_HOST` a
   `POST /oauth2/token` a `clubsadmin.*`, per a tots els clients. Només AgilityHub ID (`id-web`, al
   host de l'ID) inicia la sessió d'un compte de plataforma sense club.

   La consola arrenca al host de producte amb el branding del producte, però encara no hi pot
   entrar ningú. Mentrestant, el compte de plataforma dona el rol `AGILITYHUB_ADMIN` a un
   administrador de club (`PUT /platform/accounts/{id}/platform-roles`), que fa servir la consola
   des del backoffice del seu club.

   Pregunta 1 de l'informe d'E10-W02.
2. **El club plantilla és buit.** `club-template-default` no porta nivells, pistes, modalitats,
   FAQ ni plantilles de comunicat: els textos en tres idiomes són de Jordi (E125 #6). La clonació
   copia 0 i «Plantilles de comunicat» i «Preguntes freqüents» queden pendents.

   El club es pot activar igualment. El seu administrador crea la FAQ i les plantilles al seu
   backoffice.
3. **El DNS.** La propagació d'un registre nou no depèn de la consola i queda fora de l'hora.
   Normalment són minuts. Si [Verifica] diu que no troba cap dels dos registres, cal tornar-ho a
   provar més tard.
