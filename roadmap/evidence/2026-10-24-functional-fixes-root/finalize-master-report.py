#!/usr/bin/env python3
"""Finalize the user report only after the strict selected browser ledger passes."""
import json
from pathlib import Path
import subprocess
import sys

ROOT=Path(__file__).resolve().parent
WEB=ROOT.parents[2]
DOCS=Path('/Users/jordib/Dropbox/Documents/SOFTWARE_CANIC/05-desenvolupament')
ledger=json.loads(subprocess.check_output([sys.executable,str(ROOT/'collect-final-runs.py')],text=True))
assert ledger['allPassed'] and ledger['passedUniqueCases']==91
p=DOCS/'CORRECCIONS_I_REGRESSIO_LOCAL_2026-10-24.md'
s=p.read_text()
start=s.index('**Estat provisional:')
end=s.index('\n\n## Correccions',start)
s=s[:start]+'''**Validació funcional local completada el 26-10-2026.** Les sis incidències encarregades i les quatre detectades durant la revisió (INC-91–100) estan corregides i comprovades. Les evidències anteriors i els intents fallits es conserven; el recompte final només inclou les execucions seleccionades aprovades. El codi es pot portar a la fase de preparació de la demo, amb els requisits d'infraestructura i les limitacions indicats al final.''' +s[end:]
start=s.index('## Resultats\n')
end=s.index('\n## Límits',start)
s=s[:start]+'''## Resultats finals

Les proves pesades s'han executat una a una amb el bloqueig compartit del Mac; les revisions de codi i d'evidència s'han fet en paral·lel amb l'equip d'agents.

| Àmbit | Resultat i abast |
| --- | --- |
| API | **7.256 proves**: 4.948 unitàries i 2.308 d'integració, sense errors ni omissions. Cobertura: 98,47% de línies i 88,43% de branques; 77 controls de paquet aprovats. |
| Web | **3.636 proves**: 3.616 Vitest i 20 Node. 38/38 tasques de lint, tipus, proves i compilació aprovades, sense memòria cau. |
| Navegador amb serveis simulats | **266/266 casos**, sense omissions, i 208 captures. Revisió visual i comprovació d'amplades a 375/768/1280 px. |
| Navegador amb API local | **91/91 casos únics**, sense omissions. Inclou tots els perfils, permisos negatius, sessions, dos clubs, alta, reserves, assistència, comunicacions, facturació, privacitat i muntatge. E7 executa les branques de rellotge i E8 comprova explícitament l'aïllament entre membres d'una mateixa família. |
| Migració | **30 invocacions de CLI i 68 comprovacions**. Inclou passos parcials, represa, càrrega completa, bloqueig per club, reaplicació autoritzada, benvingudes sense duplicats i recuperació de l'informe sense repetir la importació. Els rebuigs esperats no es compten com a mutacions exitoses. |
| Regressions específiques | 13/13 casos responsive; 75/75 proves de reserves després d'aïllar la neteja entre proves; 6/6 casos nous de preparació de la cua local. Les regressions ja incloses en les bateries completes no es compten dues vegades; els sis casos del preparador són addicionals. |
| Imatge i dependències | Escaneig actualitzat: **0 vulnerabilitats altes o crítiques**, 55 mitjanes i 4 baixes (48 identificadors). Les actualitzacions compatibles pendents estan documentades. |

Imatge provada: `agilityhub-core-api:review-fixes-20261024`, identificador local `sha256:9f8a73041597a46df54ec22789dba793e9d6d20b7454fae61a9238d1824753a9`, Linux arm64, UID 10001. No és un digest publicat de registre. Els 2.241 fitxers d'entrada de l'API coincideixen amb la verificació completa; OpenAPI és idèntic entre API i web i la definició de producció continua intacta.

La CI i la bateria completa de navegador cobreixen la font d'aplicació final. Després només s'han corregit quatre fitxers de proves: la preparació de la cua inicial (script, ajudant i sis regressions) i l'accés de la prova E8 a un soci sense contrasenya. Els manifests conserven cada versió exacta i comproven que no canvia el producte, l'API ni la imatge. Els grups afectats s'han repetit; no es reutilitzen els intents fallits com a resultats aprovats.

## Incidències de les proves resoltes

- L'alta esperava el correu N-02 mentre encara es processaven més de mil esdeveniments de les dades inicials. La preparació local espera ara que aquesta cua s'hagi buidat, amb límit i diagnòstic d'errors. Es manté l'asserció de 15 segons per al correu: a la repetició, N-02 queda enviat al cap de 961 ms i és observat a la bústia abans d'1,918 s; l'alta completa passa 5/5.
- E8 intentava entrar amb contrasenya a un compte fictici creat sense contrasenya. Ara utilitza l'enllaç màgic real i verifica la identitat normal abans de canviar-ne temporalment l'idioma. Es conserven el soci seleccionat, les proves de família i tots els imports. La baixa i la facturació es repeteixen conjuntament.
- La neteja d'una prova de reserva enviava una petició tardana durant la següent. S'ha reproduït i corregit l'espera del transport abans de reiniciar les dades de prova; el codi de cancel·lació del producte no s'ha canviat.
- S'han alineat les expectatives antigues de navegació mòbil, pagament únic segons el dia i mida de pàgina del contracte. Les comprovacions d'accés, permisos i imports es mantenen.

[Informe tècnic i comandes](/Users/jordib/dev/agilityhub/agilityhub-core-web/roadmap/evidence/2026-10-24-functional-fixes-root/REPORT.md) · [Registre dels 91 casos](/Users/jordib/dev/agilityhub/agilityhub-core-web/roadmap/evidence/2026-10-24-functional-fixes-root/final-real-browser-summary.json) · [Matriu de perfils](/Users/jordib/dev/agilityhub/agilityhub-core-web/roadmap/evidence/2026-10-24-functional-fixes-release/ROLE_COVERAGE.md).
''' +s[end:]
s=s.replace('El detall i les possibilitats d\'actualització es conserven a l\'informe de release','El detall i les possibilitats d\'actualització es conserven a l\'informe de seguretat')
p.write_text(s)
p=DOCS/'INCIDENCIES_OBERTES.md';s=p.read_text()
old="oberta — F06 de l'auditoria funcional local; alinear temporalment la UI sense modificar el compte ni la preferència persistent de l'operador, o definir una excepció coordinada"
new="corregida i comprovada localment (26-10) — idioma temporal de la sessió suplantada/suport, restauració en sortir i cap escriptura de preferència prestada; E8 complet amb compte real en castellà i E10 suport aprovats, incloent permisos restringits"
assert old in s;s=s.replace(old,new)
p.write_text(s)
print('Final master report and INC96 status updated from complete91-case ledger')
