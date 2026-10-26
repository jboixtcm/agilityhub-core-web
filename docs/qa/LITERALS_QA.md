# Literals per revisar a staging — B24 · B25 (E11-W03)

> Fitxer generat per `node scripts/qa-literals.mjs` (no l'editis a mà; `--check` comprova que és al dia).
> Font: els locals `packages/i18n/src/locales/{ca,es,en}`, els mockups `docs/pantalles/**/*.html` i el registre `docs/DECISIONS_COPY_A39-A41.md`.

**Què hi ha**: cada text de la interfície (en català) que **no surt tal qual en cap mockup** aprovat, agrupat per la pantalla on el codi el mostra. Són els textos que DECISIONS_PENDENTS B24 (pantalles sense mockup) i B25 (literals proposats) diuen que es validen a staging. Els textos dels mockups no hi són: ja estan aprovats.

**Com es llegeix**: «B24» = totes les pantalles on surt no tenen mockup; «B25» = literal proposat en una pantalla que sí que en té (o transversal: errors, components). «Aprovat» = el Jordi ja el va aprovar al registre A39 (només cal mirar que es vegi bé); «—» = no és al registre, cal llegir-lo. Les variables entre claus (`{name}`) les omple l'app. Els textos en castellà i anglès són a les mateixes claus dels fitxers `es` i `en`.

**Com es fa la comparació**: un text compta com a «del mockup» quan tots els seus trossos fixos (fora de les variables) apareixen al text visible d'un mateix mockup, sense distingir majúscules. Un text que el mockup diu amb una paraula diferent surt aquí.

**Recompte**: 2966 literals per revisar (984 B24 · 1982 B25); 1998 textos surten d'un mockup; 218 són només variables o signes; 4 dels de la taula no tenen pantalla localitzada (claus que el codi calcula).

## Índex

- 03 · 04 · 06 · 07 · 29 — inici, reservar, confirmar, reserva i espera (53)
- 04 — activitats (25)
- 08 · 24 — entrenaments i pista (12)
- 10 · 23 — avui (quadre del dia) (19)
- 11 — notificacions (5)
- 12 — perfil, preferències i dades (25)
- 13 · 28 — els meus gossos, les meves dades (25)
- 12 · 13 — rebuts i pack (17)
- 14 — inactivitat (15)
- 15 — baixa (16)
- 16–19 — alta pública (47)
- 19 — pagament amb targeta (4)
- 20 · 21 · 22 · 26 — instructor (37)
- 25 — historial (9)
- 30 — info i preguntes freqüents (6)
- Recorreguts a l'app (visor, registre, sessió de muntatge) (91)
- Baixa dels avisos per correu (enllaç del correu) (6)
- 01 · 02 · 03b — accés, activació, tria de perfil i marc de l'app (42)
- D2 — validació d'una preinscripció (55)
- D1 — tauler (14)
- D3 · D3b — plantilles (26)
- D4 · D4b · D4c — calendari de classes (51)
- Inactivitats i baixes (pàgina nova) (45)
- D5 · D15 — llistats d'abonats i de gossos (25)
- D10 — fitxa d'abonat (190)
- D6 — facturació i remeses (199)
- D7 — activitats (100)
- D8 — modalitats i tarifes (27)
- D16 — pistes (12)
- D17 — instructors i administradors (9)
- D11 — paràmetres del club (432)
- D9 — comunicats i plantilles d'avís (96)
- D12 · D13 — agenda i fitxa d'alumne (17)
- D14 — seguiment d'alumnes (13)
- Entrenaments i bloquejos de pista (backoffice) (20)
- D18 — recorreguts (262)
- D19 — consola de clubs (435)
- Auditoria (54)
- Accés de suport (12)
- Marc del backoffice (accés, menú, estats de càrrega i d'error) (10)
- AgilityHub ID (accés, compte, productes) (60)
- 01 · 02 · 12 — accés i sessió (12)
- Paquets compartits (transversal) (47)
- Transversal — textos de més de tres pantalles (34)
- Missatges d'error (surten a la pantalla de l'acció que falla) (251)
- Sense pantalla localitzada (clau calculada al codi) (4)

## 03 · 04 · 06 · 07 · 29 — inici, reservar, confirmar, reserva i espera

| Clau | Text (ca) | Font | Registre | També a |
|---|---|---|---|---|
| `booking:block.banner` | Les reserves estan bloquejades: {reason}. Posa't en contacte amb el club. | B25 | — |  |
| `booking:classes.empty` | Ara mateix no hi ha cap classe per reservar amb aquest gos. | B25 | — |  |
| `booking:classes.error` | No s'han pogut carregar les classes. | B25 | — |  |
| `booking:classes.loading` | Carregant les classes | B25 | — |  |
| `booking:confirm.chargeOnAttendance` | Aquesta classe es carregarà al proper rebut ({price}). | B25 | — |  |
| `booking:confirm.done` | Reserva confirmada. Afegeix-la al calendari: | B25 | — |  |
| `booking:confirm.limitDone` | {unit, select, DOG {{week, select, NEXT {La setmana vinent ja tens {count, plural, one {una classe} =2 {dues classes} other {# classes}} amb {dogArticle}{dogName}.} other {Aquesta setmana ja has fet {count, plural, one {una classe} =2 {dues classes} other {# classes}} amb {dogArticle}{dogName}.}}} other {{week, select, NEXT {La setmana vinent ja tens {count, plural, one {una classe} =2 {dues classes} other {# classes}}.} other {Aquesta setmana ja has fet {count, plural, one {una classe} =2 {dues classes} other {# classes}}.}}}} | B25 | — |  |
| `booking:confirm.limitNoneNextWeek` | Encara no pots reservar classes de la setmana vinent. | B25 | — |  |
| `booking:confirm.limitNote` | {unit, select, DOG {Ja tens {count, plural, one {# classe} other {# classes}} {week, select, NEXT {la setmana vinent} other {aquesta setmana}} amb {dogArticle}{dogName} (límit per gos).} other {Ja tens {count, plural, one {# classe} other {# classes}} {week, select, NEXT {la setmana vinent} other {aquesta setmana}} (límit per persona).}} | B25 | — |  |
| `booking:confirm.nextBookableAt` | {week, select, NEXT {Podràs reservar aquesta classe a partir de {nextBookableAt}.} other {Podràs reservar per a la setmana vinent a partir de {nextBookableAt}.}} | B25 | — |  |
| `booking:confirm.notSelectableLATE_WINDOW` | Classe {description} · fora de termini — no es pot seleccionar | B25 | — |  |
| `booking:confirm.payAfterSwap` | En confirmar, pagaràs aquesta classe ({price}). | B25 | — |  |
| `booking:confirm.payAndBook` | PAGAR I CONFIRMAR ({price}) | B25 | — |  |
| `booking:confirm.seatTakenRetry` | Algú altre està acabant de reservar l'última plaça. Torna-ho a provar d'aquí a uns segons. | B25 | — |  |
| `booking:confirm.seeBooking` | VEURE LA RESERVA | B25 | — |  |
| `booking:confirm.sending` | Enviant | B25 | — | 08 · 24 — entrenaments i pista |
| `booking:detail.bookedByClub` | Reservada pel club el {date} a les {time} | B25 | — | 08 · 24 — entrenaments i pista |
| `booking:detail.cancelDialog` | Vols anul·lar la reserva de la classe {description}? | B25 | — |  |
| `booking:detail.error` | No s'ha pogut carregar la reserva. | B25 | — | 08 · 24 — entrenaments i pista |
| `booking:detail.lateWarning` | Falten menys de {threshold}: la sessió comptarà com a feta. | B25 | — |  |
| `booking:detail.loading` | Carregant la reserva | B25 | — | 08 · 24 — entrenaments i pista |
| `booking:detail.notFound` | Aquesta reserva no existeix o ja no és accessible. | B25 | — | 08 · 24 — entrenaments i pista |
| `booking:list.packEmpty` | Sense sessions | B25 | — |  |
| `booking:list.waitlistFullLabel` | Completa, llista d'espera plena ({waiting}/{max}) | B25 | — |  |
| `booking:list.waitlistLabel` | Completa, {waiting} en llista d'espera | B25 | — |  |
| `booking:pack.consumed` | {count, plural, one {# consumida} other {# consumides}} | B25 | — |  |
| `booking:waitlist.confirmBy` | Tens temps fins a les {time} per agafar la plaça. | B25 | — |  |
| `booking:waitlist.join` | APUNTA'M | B25 | — |  |
| `booking:waitlist.joinDialog` | Vols apuntar-te a la llista d'espera de {className}? | B25 | — |  |
| `booking:waitlist.joined` | Ets a la llista d'espera | B25 | — |  |
| `booking:waitlist.leave` | SURT DE LA LLISTA D'ESPERA | B25 | — |  |
| `booking:waitlist.leaveDialog` | Vols sortir de la llista d'espera de {className}? | B25 | — |  |
| `booking:waitlist.left` | Has sortit de la llista d'espera | B25 | — |  |
| `booking:waitlist.position` | Ets el número {position} de la llista | B25 | — |  |
| `courses:register.saved` | Registrat com a muntat. | B25 | — | Recorreguts a l'app (visor, registre, sessió de muntatge) |
| `courses:register.savedReplacing` | Registrat com a muntat; substitueix el muntatge anterior. | B25 | — | Recorreguts a l'app (visor, registre, sessió de muntatge) |
| `courses:session.finished` | Sessió acabada: el muntatge ha quedat registrat. | B25 | — | Recorreguts a l'app (visor, registre, sessió de muntatge) |
| `courses:session.finishedNoSetup` | Sessió acabada. En aquest club, l'administració registra què hi ha muntat. | B25 | aprovat (A39.135) | Recorreguts a l'app (visor, registre, sessió de muntatge) |
| `courses:viewer.dismantled` | Marcat com a desmuntat. | B25 | — | Recorreguts a l'app (visor, registre, sessió de muntatge) |
| `enums:bookableState.NOT_BOOKABLE` | no reservable | B25 | — |  |
| `enums:bookableState.PACK_EMPTY` | sense sessions | B25 | — |  |
| `enums:bookableState.WAITLIST_FULL` | completa, llista d'espera plena | B25 | — |  |
| `enums:bookableState.WAITLIST_OPEN` | completa, amb llista d'espera | B25 | — |  |
| `enums:reservationState.PAYMENT_PENDING` | pendent de pagament | B25 | — |  |
| `enums:waitlistState.EXPIRED` | caducada | B25 | — |  |
| `home:limits.label` | Classes reservades | B25 | — |  |
| `home:notifications` | {count, plural, =0 {Avisos} one {Avisos: # sense llegir} other {Avisos: # sense llegir}} | B25 | — |  |
| `home:reservations.bookClass` | RESERVA UNA CLASSE | B25 | — |  |
| `home:reservations.empty` | Encara no tens cap reserva | B25 | — |  |
| `home:reservations.error` | No s'han pogut carregar les teves reserves. | B25 | — |  |
| `home:reservations.instructorHidden` | {hours, select, 24 {instructor: es mostra el dia abans} other {instructor: es mostra {hours, number} h abans}} | B25 | — |  |
| `home:reservations.loading` | Carregant les teves reserves | B25 | — |  |
| `training:detail.cancelled` | Entrenament anul·lat | B25 | — | 08 · 24 — entrenaments i pista |

## 04 — activitats

| Clau | Text (ca) | Font | Registre | També a |
|---|---|---|---|---|
| `activities:block.error` | No s'han pogut carregar les activitats. | B25 | — |  |
| `activities:block.loading` | Carregant les activitats | B25 | — |  |
| `activities:detail.cancelButton` | ANUL·LA LA INSCRIPCIÓ | B25 | — |  |
| `activities:detail.cancelled` | Inscripció anul·lada | B25 | — |  |
| `activities:detail.cancelQuestion` | Vols anul·lar la inscripció a {title}? | B25 | — |  |
| `activities:detail.contactClubToCancel` | Per anul·lar la inscripció, posa't en contacte amb el club | B25 | — |  |
| `activities:detail.error` | No s'ha pogut completar l'acció. Torna-ho a provar. | B25 | — |  |
| `activities:detail.freeSeats` | {count, plural, one {# plaça lliure} other {# places lliures}} de {max} | B25 | — |  |
| `activities:detail.joinWaitlistButton` | APUNTA'M A LA LLISTA D'ESPERA | B25 | — |  |
| `activities:detail.leaveQuestion` | Vols sortir de la llista d'espera de {title}? | B25 | — |  |
| `activities:detail.leaveWaitlistButton` | SURT DE LA LLISTA D'ESPERA | B25 | — |  |
| `activities:detail.left` | Has sortit de la llista d'espera | B25 | — |  |
| `activities:detail.loadError` | No s'ha pogut carregar l'activitat. | B25 | — |  |
| `activities:detail.loading` | Carregant l'activitat | B25 | — |  |
| `activities:detail.notAvailable` | Aquesta activitat ja no està disponible. | B25 | — |  |
| `activities:detail.reasonHelp` | Anul·les en nom de l'abonat: el motiu queda registrat. | B25 | — |  |
| `activities:detail.reasonInvalid` | Escriu el motiu de l'anul·lació (fins a {max} caràcters). | B25 | — |  |
| `activities:detail.registerButton` | INSCRIU-M'HI | B25 | — |  |
| `activities:detail.registered` | T'hi has inscrit | B25 | — |  |
| `activities:detail.registrationUntil` | Inscripció fins el {date} | B25 | — |  |
| `activities:detail.sending` | Enviant | B25 | — |  |
| `activities:detail.waitlisted` | Ets a la llista d'espera | B25 | — |  |
| `activities:detail.waitlistPosition` | en llista d'espera ({position}) | B25 | — |  |
| `activities:detail.waitlistQuestion` | Vols apuntar-te a la llista d'espera de {title}? | B25 | — |  |
| `activities:list.fullWaitlist` | Completa · ⏳{waiting} | B25 | — |  |

## 08 · 24 — entrenaments i pista

| Clau | Text (ca) | Font | Registre | També a |
|---|---|---|---|---|
| `enums:slotReason.OWN_TRAINING` | el teu entrenament | B25 | — | 20 · 21 · 22 · 26 — instructor |
| `training:confirm.done` | Entrenament reservat | B25 | — |  |
| `training:confirm.sending` | Enviant | B25 | — |  |
| `training:day.closed` | El club està tancat aquest dia | B25 | — | 20 · 21 · 22 · 26 — instructor; Entrenaments i bloquejos de pista (backoffice) |
| `training:detail.cancelDialog` | Vols anul·lar la reserva d'aquest entrenament? | B25 | — |  |
| `training:detail.tooLate` | Ja no es pot anul·lar des de l'app: posa't en contacte amb el club. | B25 | — |  |
| `training:detail.tooLateDetails` | Només es pot anul·lar fins a {threshold} abans de començar, i en falten {remaining}. | B25 | — |  |
| `training:error` | No s'han pogut carregar els entrenaments. | B25 | — |  |
| `training:grid.stale` | pot no estar al dia | B25 | — |  |
| `training:limit.withCancellable` | Has arribat al límit de {limit} reserves per aquesta setmana: anul·la alguna de les properes per reservar-ne una altra. | B25 | — |  |
| `training:loading` | Carregant els entrenaments | B25 | — |  |
| `training:rings.setup` | {ring}: recorregut muntat | B25 | — |  |

## 10 · 23 — avui (quadre del dia)

| Clau | Text (ca) | Font | Registre | També a |
|---|---|---|---|---|
| `enums:classState.FINISHED` | finalitzada | B25 | — | D4 · D4b · D4c — calendari de classes |
| `home:today.empty` | Cap classe aquest dia | B25 | — |  |
| `home:today.loadError` | No s'ha pogut carregar el quadre del dia. | B25 | — |  |
| `home:today.loading` | Carregant el quadre del dia | B25 | — |  |
| `home:today.nextDay` | Dia següent | B25 | — |  |
| `home:today.previousDay` | Dia anterior | B25 | — |  |
| `home:today.weekDays` | Dies de la setmana | B25 | — |  |
| `instructor:overview.blockDrawer.cancel` | Anul·la el bloqueig | B25 | — |  |
| `instructor:overview.blockDrawer.cancelling` | Anul·lant el bloqueig | B25 | — |  |
| `instructor:overview.blockDrawer.createdBy` | Creat per | B25 | — |  |
| `instructor:overview.blockDrawer.loadError` | No s'ha pogut carregar el bloqueig. | B25 | — |  |
| `instructor:overview.blockDrawer.loading` | Carregant el bloqueig | B25 | — |  |
| `instructor:overview.blockDrawer.title` | Bloqueig de pista | B25 | — |  |
| `instructor:overview.class.loadError` | No s'ha pogut carregar la classe. | B25 | — |  |
| `instructor:overview.class.loading` | Carregant la classe | B25 | — |  |
| `instructor:overview.class.when` | Data i hora | B25 | — |  |
| `instructor:overview.registrants.empty` | Encara no hi ha cap inscrit. | B25 | — | 20 · 21 · 22 · 26 — instructor |
| `instructor:overview.registrants.loadError` | No s'han pogut carregar els inscrits. | B25 | — |  |
| `instructor:overview.registrants.loading` | Carregant els inscrits… | B25 | — |  |

## 11 — notificacions

| Clau | Text (ca) | Font | Registre | També a |
|---|---|---|---|---|
| `notifications:feed.action.expired` | Aquesta plaça ja no està disponible | B25 | — |  |
| `notifications:feed.empty` | Encara no tens cap avís | B25 | — |  |
| `notifications:feed.error` | No s'han pogut carregar les notificacions. | B25 | — |  |
| `notifications:feed.loading` | Carregant les notificacions | B25 | — |  |
| `notifications:feed.loadingMore` | Carregant més avisos | B25 | — |  |

## 12 — perfil, preferències i dades

| Clau | Text (ca) | Font | Registre | També a |
|---|---|---|---|---|
| `auth:profile.appAlwaysOn` | Avisos a l'app activats | B25 | — |  |
| `auth:profile.dataExport.action` | Descarrega les meves dades | B25 | aprovat (A39.159) |  |
| `auth:profile.dataExport.availableUntil` | Disponible fins al {date}. | B25 | aprovat (A39.215) |  |
| `auth:profile.dataExport.description` | Prepara un paquet amb les dades del teu compte. | B25 | aprovat (A39.158) |  |
| `auth:profile.dataExport.download` | Descarrega el paquet | B25 | aprovat (A39.216) |  |
| `auth:profile.dataExport.downloadError` | No s'ha pogut descarregar el paquet. | B25 | aprovat (A39.219) |  |
| `auth:profile.dataExport.downloading` | Descarregant el paquet… | B25 | aprovat (A39.217) |  |
| `auth:profile.dataExport.error` | No s'ha pogut consultar el paquet. | B25 | aprovat (A39.218) |  |
| `auth:profile.dataExport.expired` | El paquet ha caducat. | B25 | aprovat (A39.162) |  |
| `auth:profile.dataExport.failed` | No s'ha pogut preparar el paquet. | B25 | aprovat (A39.161) |  |
| `auth:profile.dataExport.preparing` | Preparant el paquet… | B25 | aprovat (A39.212) |  |
| `auth:profile.dataExport.ready` | Les teves dades estan a punt. | B25 | aprovat (A39.160) |  |
| `auth:profile.dataExport.stillPreparing` | El paquet encara s'està preparant. T'avisarem quan estigui a punt. | B25 | aprovat (A39.213) |  |
| `auth:profile.iosInstall` | Afegeix l'app a la pantalla d'inici per rebre notificacions | B25 | — |  |
| `auth:profile.iosSteps` | Comparteix ▸ Afegeix a la pantalla d'inici | B25 | — |  |
| `auth:profile.logout` | Tanca la sessió | B25 | — | Marc del backoffice (accés, menú, estats de càrrega i d'error) |
| `auth:profile.noticesError` | No s'han pogut carregar els avisos. | B25 | — |  |
| `auth:profile.noticesLoading` | Carregant els avisos | B25 | — |  |
| `auth:profile.pushDenied` | Activa les notificacions al navegador per rebre-les al mòbil | B25 | — |  |
| `auth:profile.reminder.invalid` | Aquesta opció de recordatori ja no és vàlida. Tria'n una altra. | B25 | — |  |
| `auth:profile.saving` | Desant… | B25 | — |  |
| `inactivity:profileRow.open` | inactivitat des de {from} | B25 | — |  |
| `inactivity:profileRow.requested` | pendent d'aprovació · {month} | B25 | — |  |
| `leave:profileRow.planned` | baixa el {date} | B25 | — |  |
| `leave:profileRow.requested` | baixa sol·licitada el {date} | B25 | — |  |

## 13 · 28 — els meus gossos, les meves dades

| Clau | Text (ca) | Font | Registre | També a |
|---|---|---|---|---|
| `census:myData.invalidEmail` | El correu electrònic no és vàlid. | B25 | — |  |
| `census:myData.invalidPostalCode` | El codi postal no és vàlid. | B25 | — |  |
| `census:myData.loadError` | No s'han pogut carregar les teves dades. | B25 | — |  |
| `census:myData.loading` | Carregant les teves dades | B25 | — |  |
| `census:myData.primaryEmail` | Email principal | B25 | — |  |
| `census:myData.primaryPhone` | Telèfon principal | B25 | — |  |
| `census:myData.saved` | Dades desades | B25 | — |  |
| `census:myData.secondPhone` | Segon telèfon (opcional) | B25 | — |  |
| `census:myDogs.changePhoto` | Canvia la foto de {dog} | B25 | — |  |
| `census:myDogs.documentDialog` | Afegeix un document | B25 | — |  |
| `census:myDogs.documentDialogFor` | Afegeix un document de {dog} | B25 | — |  |
| `census:myDogs.documentName` | Nom del document | B25 | — |  |
| `census:myDogs.documentSaved` | Document desat | B25 | — |  |
| `census:myDogs.empty` | Encara no tens cap gos donat d'alta | B25 | — |  |
| `census:myDogs.loadError` | No s'han pogut carregar els teus gossos. | B25 | — |  |
| `census:myDogs.loading` | Carregant els teus gossos | B25 | — |  |
| `census:myDogs.noteSaved` | Nota de {dog} desada | B25 | — |  |
| `census:myDogs.packExpired` | caducat | B25 | — |  |
| `census:myDogs.pendingValidation` | pendent de validació | B25 | — |  |
| `census:myDogs.photoSaved` | Foto de {dog} desada | B25 | — |  |
| `census:myDogs.tasksSummary` | {open, plural, one {# pendent} other {# pendents}} · {completed, plural, one {# feta} other {# fetes}} | B25 | — |  |
| `census:myDogs.uploadDocument` | PUJA EL DOCUMENT | B25 | — |  |
| `census:selfService.back` | Torna al perfil | B25 | — |  |
| `census:selfService.errorTitle` | No s'ha pogut obrir aquesta pantalla | B25 | — |  |
| `census:selfService.genericError` | No s'ha pogut completar l'acció. | B25 | — |  |

## 12 · 13 — rebuts i pack

| Clau | Text (ca) | Font | Registre | També a |
|---|---|---|---|---|
| `billing:back` | Torna al perfil | B25 | — |  |
| `billing:cardBanner.action` | Actualitza la targeta | B25 | — |  |
| `billing:cardBanner.error` | Ara mateix no es pot actualitzar la targeta. | B25 | — |  |
| `billing:cardBanner.invalid` | Targeta no vàlida | B25 | — |  |
| `billing:cardBanner.title` | No hem pogut cobrar el rebut de {month} | B25 | — |  |
| `billing:cardBanner.working` | Obrint l'actualització de targeta | B25 | — |  |
| `billing:detail.download` | Descarrega el justificant | B25 | — |  |
| `billing:detail.downloadError` | No s'ha pogut descarregar el justificant. | B25 | — |  |
| `billing:detail.downloading` | Preparant el justificant | B25 | — |  |
| `billing:detail.lines` | Conceptes | B25 | — |  |
| `billing:detail.paymentMethod` | Mètode de pagament | B25 | — |  |
| `billing:detail.title` | Detall del rebut | B25 | — |  |
| `billing:empty` | Encara no tens cap rebut. | B25 | — |  |
| `billing:list.more` | Carrega'n més | B25 | — |  |
| `billing:loadError` | No s'han pogut carregar els rebuts. | B25 | — |  |
| `billing:loading` | Carregant els rebuts | B25 | — |  |
| `enums:invoiceStatus.REFUNDED` | reemborsat | B25 | — | D6 — facturació i remeses |

## 14 — inactivitat

| Clau | Text (ca) | Font | Registre | També a |
|---|---|---|---|---|
| `inactivity:back` | Torna al perfil | B25 | — |  |
| `inactivity:errors.deadlinePassed` | Ja ha passat el dia {deadlineDay}: el primer mes que pots demanar és {month}. | B25 | — |  |
| `inactivity:errors.generic` | No s'ha pogut desar la sol·licitud. | B25 | — |  |
| `inactivity:errors.invalidRange` | El període indicat no és vàlid. | B25 | — |  |
| `inactivity:errors.leaveScheduled` | No pots demanar una inactivitat si ja tens una baixa prevista. | B25 | — |  |
| `inactivity:errors.memberNotActive` | Només els abonats actius poden demanar un període d'inactivitat. | B25 | — |  |
| `inactivity:errors.overlap` | Ja tens un període demanat: modifica'l | B25 | — |  |
| `inactivity:errors.stale` | El període ha canviat. | B25 | — |  |
| `inactivity:form.bookingsInside` | {count, plural, one {Ara tens # reserva dins del període: s'anul·larà si el club aprova la sol·licitud.} other {Ara tens # reserves dins del període: s'anul·laran si el club aprova la sol·licitud.}} | B25 | — |  |
| `inactivity:form.confirmWithdraw` | Vols retirar aquesta sol·licitud? | B25 | — |  |
| `inactivity:form.saved` | La sol·licitud s'ha desat. | B25 | — |  |
| `inactivity:form.withdraw` | RETIRA LA SOL·LICITUD | B25 | — |  |
| `inactivity:form.withdrawn` | La sol·licitud s'ha retirat. | B25 | — |  |
| `inactivity:loadError` | No s'ha pogut carregar el període d'inactivitat. | B25 | — |  |
| `inactivity:loading` | Carregant el període d'inactivitat | B25 | — |  |

## 15 — baixa

| Clau | Text (ca) | Font | Registre | També a |
|---|---|---|---|---|
| `leave:back` | Torna al perfil | B25 | — |  |
| `leave:errors.alreadyRequested` | Ja tens una sol·licitud de baixa pendent. | B25 | — |  |
| `leave:errors.alreadyScheduled` | Ja tens una baixa prevista. | B25 | — |  |
| `leave:errors.dateInvalid` | La data de baixa no és vàlida. | B25 | — |  |
| `leave:errors.generic` | No s'ha pogut enviar la sol·licitud. | B25 | — |  |
| `leave:errors.memberNotActive` | Només els abonats actius poden demanar la baixa. | B25 | — |  |
| `leave:errors.reasonUnknown` | Tria un motiu vàlid. | B25 | — |  |
| `leave:form.confirmWithdraw` | Vols retirar aquesta sol·licitud? | B25 | — |  |
| `leave:form.saved` | La sol·licitud s'ha enviat. | B25 | — |  |
| `leave:form.withdraw` | RETIRA LA SOL·LICITUD | B25 | — |  |
| `leave:form.withdrawn` | La sol·licitud s'ha retirat. | B25 | — |  |
| `leave:loadError` | No s'ha pogut carregar la sol·licitud de baixa. | B25 | — |  |
| `leave:loading` | Carregant la sol·licitud de baixa | B25 | — |  |
| `leave:offer.fee` | La quota és de {first} el primer mes i {following} els següents. | B25 | — |  |
| `leave:offer.text` | Si tens previst tornar més endavant, recorda que pots demanar un període d'inactivitat (predefinit o obert) i mantenir la teva entrada vigent i el teu import de quota actual per quan tornis. | B25 | — |  |
| `leave:plannedLeave` | Tens la baixa prevista el {date}. Per canviar-la, contacta amb el club. | B25 | — |  |

## 16–19 — alta pública

| Clau | Text (ca) | Font | Registre | També a |
|---|---|---|---|---|
| `signup:common.back` | Torna al pas anterior | B25 | — |  |
| `signup:common.duplicateEmail` | Els dos correus han de ser diferents. | B25 | — |  |
| `signup:common.genericError` | No s'ha pogut completar l'acció. | B25 | — |  |
| `signup:common.invalidDate` | La data no és vàlida. | B25 | — |  |
| `signup:common.invalidEmail` | El correu electrònic no és vàlid. | B25 | — |  |
| `signup:common.invalidMonth` | El mes de naixement no és vàlid. | B25 | — |  |
| `signup:common.invalidPhone` | El telèfon no és vàlid. | B25 | — |  |
| `signup:common.invalidPostalCode` | El codi postal no és vàlid. | B25 | — |  |
| `signup:common.loadError` | No s'ha pogut carregar el formulari. | B25 | — |  |
| `signup:common.loading` | Carregant el formulari | B25 | — |  |
| `signup:common.rateLimited` | Massa intents. Torna-ho a provar d'aquí a {seconds} s. | B25 | — |  |
| `signup:common.required` | Aquest camp és obligatori. | B25 | — |  |
| `signup:dog.birthMonthPlaceholder` | mm/aaaa | B25 | — |  |
| `signup:dog.documentRequired` | Cal adjuntar la cartilla de vacunes per continuar: toca «Cartilla de vacunes» i puja'n una foto o un PDF. | B25 | — |  |
| `signup:dog.invalidChip` | El número de xip no és vàlid. | B25 | — |  |
| `signup:dog.notesToInstructors` | Notes als instructors (opcional) | B25 | — |  |
| `signup:dog.priceOverlap` | El club ha de revisar els preus d'aquesta modalitat. | B25 | — |  |
| `signup:dog.singleClassPrice` | {price}/classe | B25 | — |  |
| `signup:dog.tooManyFiles` | Es poden adjuntar com a màxim 10 fitxers. | B25 | — |  |
| `signup:dog.uploading` | Pujant el document | B25 | — |  |
| `signup:family.bothFields` | Omple els dos camps o deixa'ls tots dos buits. | B25 | — |  |
| `signup:family.notFound` | No podem trobar la persona que indiques. Revisa el nom del responsable i el nom del gos i torna-ho a provar, o contacta amb nosaltres perquè ho revisem. | B25 | — |  |
| `signup:honeypot` | Lloc web | B25 | — |  |
| `signup:payment.addDogReviewFooter` | El club revisarà la sol·licitud i el pagament del gos nou, i t'avisarem a l'app quan l'hagi validat. | B25 | — |  |
| `signup:payment.cancelled` | El pagament no s'ha completat: pots reintentar-lo des del correu que t'hem enviat. | B25 | — |  |
| `signup:payment.cardSecure` | Pagaràs amb targeta de forma segura en enviar la sol·licitud. | B25 | — |  |
| `signup:payment.consentOutdated` | La política ha canviat. Revisa-la i torna a acceptar-la. | B25 | — |  |
| `signup:payment.currentMethod` | Mètode de pagament actual | B25 | — |  |
| `signup:payment.holderTaxId` | NIF del titular (opcional) | B25 | — |  |
| `signup:payment.payNow` | PAGA ARA | B25 | — |  |
| `signup:payment.stripeSubmit` | El pagament es fa en enviar | B25 | — |  |
| `signup:payment.submitting` | Enviant la sol·licitud | B25 | — |  |
| `signup:person.alreadyPending` | Ja tenim una sol·licitud pendent amb aquestes dades; el club la revisarà aviat. | B25 | — |  |
| `signup:person.birthDatePlaceholder` | dd/mm/aaaa | B25 | — |  |
| `signup:person.contactClub` | Ja constes al club sense accés digital. Contacta amb el club perquè t'ajudi a afegir el gos. | B25 | — |  |
| `signup:person.documentType` | Tipus de document | B25 | — |  |
| `signup:person.existingDogNote` | Ja ets soci i vols afegir un altre gos? Fes servir el mateix formulari: et reconeixerem pel document d'identitat o l'email (verificació per correu) i només registrarem el gos nou. | B25 | — |  |
| `signup:person.otherType` | Altre document | B25 | — |  |
| `signup:person.resend` | Torna-m'ho a enviar | B25 | — |  |
| `signup:person.reviewEmail` | T'hem enviat un enllaç de verificació a {email}. | B25 | — |  |
| `signup:person.reviewEmailTitle` | Revisa el correu | B25 | — |  |
| `signup:person.secondPhone` | Segon telèfon (opcional) | B25 | — |  |
| `signup:step4.additionalDog.nextMonth` | Alta l’{date} (ara només l'entrada) | B25 | — |  |
| `signup:step4.additionalDog.today` | Alta avui, {date} (quota addicional d'aquest mes) | B25 | — |  |
| `signup:success.backToDogs` | TORNA ALS MEUS GOSSOS | B25 | — |  |
| `signup:success.checkout` | Rebràs la confirmació del pagament per correu | B25 | — |  |
| `signup:success.title` | Sol·licitud enviada | B25 | — |  |

## 19 — pagament amb targeta

| Clau | Text (ca) | Font | Registre | També a |
|---|---|---|---|---|
| `billing:checkout.closeHint` | Ja pots tancar aquesta pàgina. | B25 | — |  |
| `billing:checkout.expired` | La sessió de pagament ha caducat. | B25 | — |  |
| `billing:checkout.paid` | Pagament rebut | B25 | — |  |
| `billing:checkout.pending` | Estem confirmant el pagament… | B25 | — |  |

## 20 · 21 · 22 · 26 — instructor

| Clau | Text (ca) | Font | Registre | També a |
|---|---|---|---|---|
| `instructor:attendance.joinedAt` | {kind, select, minutes {des de fa {count} min} hours {des de fa {count} h} today {des d'avui {time}} yesterday {des d'ahir {time}} other {des del {date} {time}}} | B25 | — |  |
| `instructor:attendance.legend` | Llegenda | B25 | — |  |
| `instructor:attendance.loadError` | No s'ha pogut carregar la llista. | B25 | — |  |
| `instructor:attendance.loading` | Carregant la llista | B25 | — |  |
| `instructor:attendance.noticeAlreadySent` | avís ja enviat | B25 | — | D12 · D13 — agenda i fitxa d'alumne |
| `instructor:attendance.pendingTasks` | {count, plural, one {# tasca pendent} other {# tasques pendents}} | B25 | — | D12 · D13 — agenda i fitxa d'alumne |
| `instructor:attendance.photoClose` | Tanca la foto de {dog} | B25 | — |  |
| `instructor:attendance.photoOpen` | Mostra la foto de {dog} a pantalla completa | B25 | — |  |
| `instructor:attendance.saved` | Llista desada | B25 | — | D12 · D13 — agenda i fitxa d'alumne |
| `instructor:attendance.saving` | Desant la llista | B25 | — | D12 · D13 — agenda i fitxa d'alumne |
| `instructor:attendance.staleToast` | Algú ha desat la llista fa un moment: revisa-la | B25 | — | D12 · D13 — agenda i fitxa d'alumne |
| `instructor:attendance.waitlistRule` | {mode, select, FIFO {Si s'allibera una plaça, s'avisa per ordre d'arribada: cadascú té {minutes} min per confirmar.} other {Si s'allibera una plaça, s'avisa alhora tothom qui espera.}} | B25 | — |  |
| `instructor:card.loadError` | No s'ha pogut carregar la fitxa. | B25 | — | D12 · D13 — agenda i fitxa d'alumne |
| `instructor:card.loading` | Carregant la fitxa | B25 | — | D12 · D13 — agenda i fitxa d'alumne |
| `instructor:card.noClasses` | Encara no hi ha classes | B25 | — | D12 · D13 — agenda i fitxa d'alumne |
| `instructor:card.noNotes` | Encara no hi ha cap nota | B25 | — |  |
| `instructor:card.noObservations` | Encara no hi ha cap observació | B25 | — |  |
| `instructor:card.search` | Cerca un alumne | B25 | — |  |
| `instructor:day.blockCreatedBy` | Creat per {name} | B25 | — |  |
| `instructor:day.empty` | Cap classe aquest dia | B25 | — |  |
| `instructor:day.loadError` | No s'ha pogut carregar el dia. | B25 | — |  |
| `instructor:day.loading` | Carregant el dia | B25 | — |  |
| `instructor:day.sheetDone` | llista passada | B25 | — |  |
| `instructor:ringBlock.askAdmin` | Demana a l'administració que alliberi la pista. | B25 | — | Entrenaments i bloquejos de pista (backoffice) |
| `instructor:ringBlock.conflicts` | Coincideix amb: | B25 | — | Entrenaments i bloquejos de pista (backoffice) |
| `instructor:ringBlock.error` | No s'han pogut carregar les hores de la pista. | B25 | — | Entrenaments i bloquejos de pista (backoffice) |
| `instructor:ringBlock.grid` | Hores de la franja | B25 | — |  |
| `instructor:ringBlock.loading` | Carregant les hores de la pista | B25 | — |  |
| `instructor:ringBlock.noSlots` | No hi ha hores en aquesta franja. | B25 | — |  |
| `instructor:ringBlock.sending` | Enviant | B25 | — | Entrenaments i bloquejos de pista (backoffice) |
| `instructor:ringBlock.submit.BLOCK` | Bloqueja la pista | B25 | — |  |
| `instructor:students.empty` | Cap alumne amb aquesta cerca | B25 | — | D12 · D13 — agenda i fitxa d'alumne |
| `instructor:students.loadError` | No s'han pogut carregar els alumnes. | B25 | — | D12 · D13 — agenda i fitxa d'alumne |
| `instructor:students.loading` | Carregant els alumnes | B25 | — | D12 · D13 — agenda i fitxa d'alumne |
| `instructor:students.more` | Mostra'n més | B25 | — | D12 · D13 — agenda i fitxa d'alumne |
| `instructor:students.search` | Cerca un alumne | B25 | — | D12 · D13 — agenda i fitxa d'alumne |
| `instructor:tasks.loading` | Carregant les tasques | B25 | — | D12 · D13 — agenda i fitxa d'alumne; Paquets compartits (transversal) |

## 25 — historial

| Clau | Text (ca) | Font | Registre | També a |
|---|---|---|---|---|
| `history:detail.byClubOnBehalf` | Pel club en nom teu · no compta | B25 | — |  |
| `history:detail.noticeInTime` | Vas avisar el club, dins termini · no compta | B25 | — |  |
| `history:detail.noticeLate` | Vas avisar el club el {date} a les {time} · compta com a feta | B25 | — |  |
| `history:detail.system` | Per inactivitat o baixa · no compta | B25 | — |  |
| `history:empty` | Encara no hi ha res a l'històric | B25 | — |  |
| `history:list` | Històric de classes, entrenaments i activitats | B25 | — |  |
| `history:loadError` | No s'ha pogut carregar l'històric. | B25 | — |  |
| `history:loading` | Carregant l'històric | B25 | — |  |
| `history:window` | {months, plural, one {Darrer mes, del més recent al més antic} other {Darrers # mesos, del més recent al més antic}} | B25 | — |  |

## 30 — info i preguntes freqüents

| Clau | Text (ca) | Font | Registre | També a |
|---|---|---|---|---|
| `shell:info.empty` | Encara no hi ha informació publicada. | B25 | — |  |
| `shell:info.loadError` | No s'ha pogut carregar la informació. | B25 | — |  |
| `shell:info.loading` | Carregant la informació | B25 | — |  |
| `shell:info.noFaq` | El club encara no ha publicat preguntes | B25 | — |  |
| `shell:info.tabs` | Informació del club | B25 | — |  |
| `shell:info.updated` | Actualitzat el {date} | B25 | — |  |

## Recorreguts a l'app (visor, registre, sessió de muntatge)

| Clau | Text (ca) | Font | Registre | També a |
|---|---|---|---|---|
| `courses:blocks.bookingPlanned` | Recorregut previst: {course} | B24 | — |  |
| `courses:blocks.bookingSetup` | A la pista hi ha muntat: {setup} | B24 | — |  |
| `courses:blocks.columnRegister` | Registra què hi ha muntat a {ring} | B24 | — |  |
| `courses:blocks.columnSetup` | Recorregut muntat a {ring} | B24 | — |  |
| `courses:blocks.registerOn` | Registra què hi ha muntat a {ring} | B24 | — |  |
| `courses:blocks.trainingTitle` | Recorreguts muntats | B24 | — |  |
| `courses:builtAgo` | muntat {days, plural, =0 {avui} =1 {ahir} other {fa # dies}} | B25 | aprovat (A39.137) | D12 · D13 — agenda i fitxa d'alumne |
| `courses:loading` | Carregant | B25 | — | 01 · 02 · 03b — accés, activació, tria de perfil i marc de l'app |
| `courses:register.activeError` | No s'ha pogut llegir què hi ha muntat ara a la pista. | B24 | — |  |
| `courses:register.agilityhubLevel` | Escala AgilityHub | B24 | — |  |
| `courses:register.changePhoto` | Canvia la foto | B24 | — |  |
| `courses:register.clubLevels` | Nivells del club | B24 | — |  |
| `courses:register.courseRequired` | Tria un recorregut de la llista. | B24 | — |  |
| `courses:register.emptyHelp` | La pista quedarà marcada com a buida. | B24 | aprovat (A39.128) |  |
| `courses:register.instructorRefused` | En aquest club només l'administració pot registrar què hi ha muntat. | B24 | aprovat (A39.132) |  |
| `courses:register.kind` | Què hi ha muntat? | B24 | aprovat (A39.127) |  |
| `courses:register.level` | Nivell orientatiu | B24 | aprovat (A39.73) |  |
| `courses:register.noCourses` | No hi ha cap recorregut amb aquesta cerca. | B24 | — |  |
| `courses:register.noLevel` | Sense nivell | B24 | — |  |
| `courses:register.photoPreview` | Foto triada | B24 | — |  |
| `courses:register.photoRequired` | Afegeix una foto o un plànol del muntatge. | B24 | — |  |
| `courses:register.replaces` | Substituirà el muntatge actual ({kind}, de {day}). | B24 | aprovat (A39.131) |  |
| `courses:register.ringsError` | No s'han pogut carregar les pistes. | B24 | — |  |
| `courses:register.search` | Cerca un recorregut | B24 | — |  |
| `courses:register.searchPlaceholder` | Nom, dissenyador o etiqueta | B24 | — |  |
| `courses:register.source` | D'on surt? | B24 | aprovat (A39.129) |  |
| `courses:register.sourceCourse` | Un recorregut de la biblioteca | B24 | — |  |
| `courses:register.sourcePhoto` | Foto o plànol | B24 | — |  |
| `courses:register.takePhoto` | Fes una foto o tria'n una | B24 | — |  |
| `courses:register.title` | Registra què hi ha muntat | B24 | — |  |
| `courses:register.until` | Fins quan? | B24 | — |  |
| `courses:register.untilHelp` | Si ho deixes en blanc, es retira sol al cap dels dies que té configurats el club. | B24 | aprovat (A39.130) |  |
| `courses:register.untilPast` | Tria avui o un dia posterior. | B24 | — |  |
| `courses:sending` | Enviant | B24 | — |  |
| `courses:session.closed` | La sessió de muntatge s'ha acabat. | B24 | — |  |
| `courses:session.code` | Codi per unir-s'hi: | B24 | aprovat (A39.134) |  |
| `courses:session.notFound` | Aquesta sessió de muntatge no existeix o no és d'aquest club. | B24 | — |  |
| `courses:session.openSetup` | Obre el muntatge | B24 | — |  |
| `courses:session.progress` | {placed} de {total} col·locats | B24 | — |  |
| `courses:session.sheet` | Full de muntatge | B24 | — |  |
| `courses:session.sheetFile` | full-de-muntatge.pdf | B24 | — |  |
| `courses:session.tap` | {number}, {type}, {status}. Toca per passar a {next}. | B24 | aprovat (A39.136) |  |
| `courses:session.title` | Sessió de muntatge | B24 | — |  |
| `courses:viewer.buildSession` | Sessió de muntatge | B24 | — |  |
| `courses:viewer.course` | Recorregut: {name} | B24 | — |  |
| `courses:viewer.dismantle` | Marca com a desmuntat | B24 | — |  |
| `courses:viewer.dismantleConfirm` | El muntatge de {ring} deixarà de sortir als quadres i a la reserva d'entrenaments. | B24 | aprovat (A39.123) |  |
| `courses:viewer.empty` | La pista és buida: no hi ha res muntat. | B24 | aprovat (A39.121) |  |
| `courses:viewer.error` | No s'ha pogut carregar el muntatge. | B25 | — | D12 · D13 — agenda i fitxa d'alumne |
| `courses:viewer.join.label` | Codi d'una sessió de muntatge | B24 | aprovat (A39.124) |  |
| `courses:viewer.join.notFound` | No hi ha cap sessió oberta amb aquest codi. | B24 | aprovat (A39.126) |  |
| `courses:viewer.join.required` | Escriu el codi de la sessió. | B24 | — |  |
| `courses:viewer.join.submit` | Uneix-t'hi | B24 | aprovat (A39.125) |  |
| `courses:viewer.loading` | Carregant el muntatge | B25 | — | D12 · D13 — agenda i fitxa d'alumne |
| `courses:viewer.loading3d` | Carregant la vista 3D | B24 | — |  |
| `courses:viewer.none` | Sense recorregut registrat | B24 | aprovat (A39.119) |  |
| `courses:viewer.noneHelp` | Quan es registri què hi ha muntat a aquesta pista, ho veuràs aquí. | B24 | aprovat (A39.120) |  |
| `courses:viewer.noPlan` | No hi ha cap plànol per mostrar. | B24 | — |  |
| `courses:viewer.notFound` | Aquest muntatge ja no es mostra. | B24 | — |  |
| `courses:viewer.photo` | Foto o plànol del muntatge | B25 | — | D12 · D13 — agenda i fitxa d'alumne |
| `courses:viewer.plan` | Plànol de {name} | B24 | — |  |
| `courses:viewer.plan3d` | Vista 3D de {name} | B24 | — |  |
| `courses:viewer.register` | Registra què hi ha muntat | B24 | aprovat (A39.122) |  |
| `courses:viewer.rotate` | Gira un quart de volta | B24 | — |  |
| `courses:viewer.stale` | Geometria canviada: revisa la col·locació | B24 | — |  |
| `courses:viewer.title` | Recorregut muntat | B24 | — |  |
| `courses:viewer.until` | previst fins {date} | B25 | — | D12 · D13 — agenda i fitxa d'alumne |
| `courses:viewer.zoomOut` | Redueix | B24 | — |  |
| `enums:agilityhubLevel.EASY` | Fàcil | B25 | aprovat (A39.74) | D12 · D13 — agenda i fitxa d'alumne; D18 — recorreguts |
| `enums:agilityhubLevel.HARD` | Difícil | B25 | aprovat (A39.76) | D12 · D13 — agenda i fitxa d'alumne; D18 — recorreguts |
| `enums:agilityhubLevel.MEDIUM` | Mitjà | B25 | aprovat (A39.75) | D12 · D13 — agenda i fitxa d'alumne; D18 — recorreguts |
| `enums:buildObstacleStatus.PLACED` | col·locat | B24 | aprovat (A39.140) |  |
| `enums:buildObstacleStatus.SKIPPED` | saltat | B24 | aprovat (A39.141) |  |
| `enums:buildSessionStatus.ABANDONED` | abandonada | B24 | aprovat (A39.146) |  |
| `enums:buildSessionStatus.COMPLETED` | acabada | B24 | aprovat (A39.145) |  |
| `enums:buildSessionStatus.NOT_STARTED` | sense començar | B24 | aprovat (A39.143) |  |
| `enums:obstacleType.AFrame` | Empalissada | B24 | aprovat (A39.84) | D18 — recorreguts |
| `enums:obstacleType.DogWalk` | Passarel·la | B24 | aprovat (A39.83) | D18 — recorreguts |
| `enums:obstacleType.DoubleJump` | Salt doble | B24 | aprovat (A39.78) | D18 — recorreguts |
| `enums:obstacleType.LongJump` | Salt de llargada | B24 | aprovat (A39.87) | D18 — recorreguts |
| `enums:obstacleType.Tire` | Roda | B24 | aprovat (A39.89) | D18 — recorreguts |
| `enums:obstacleType.Tunnel3m` | Túnel de 3 m | B24 | aprovat (A39.79) | D18 — recorreguts |
| `enums:obstacleType.Tunnel4m` | Túnel de 4 m | B24 | aprovat (A39.80) | D18 — recorreguts |
| `enums:obstacleType.Tunnel5m` | Túnel de 5 m | B24 | aprovat (A39.81) | D18 — recorreguts |
| `enums:obstacleType.Tunnel6m` | Túnel de 6 m | B24 | aprovat (A39.82) | D18 — recorreguts |
| `enums:obstacleType.Wall` | Mur | B24 | aprovat (A39.88) | D18 — recorreguts |
| `enums:obstacleType.Weave` | Eslàlom | B24 | aprovat (A39.86) | D18 — recorreguts |
| `enums:setupKind.OBSTACLE_DRILL` | Treball d'obstacle | B25 | aprovat (A39.150) | D12 · D13 — agenda i fitxa d'alumne; D18 — recorreguts |
| `enums:setupStatus.ACTIVE` | Muntat | B24 | aprovat (A39.115) | D18 — recorreguts |
| `enums:setupStatus.DISMANTLED` | Desmuntat | B24 | aprovat (A39.117) | D18 — recorreguts |
| `enums:setupStatus.EXPIRED` | Caducat | B24 | aprovat (A39.116) | D18 — recorreguts |

## Baixa dels avisos per correu (enllaç del correu)

| Clau | Text (ca) | Font | Registre | També a |
|---|---|---|---|---|
| `notifications:unsubscribe.done` | Ja no rebràs els comunicats del club per correu. | B24 | — |  |
| `notifications:unsubscribe.error` | No s'ha pogut completar la baixa. | B24 | — |  |
| `notifications:unsubscribe.invalid` | Aquest enllaç ja no és vàlid. | B24 | — |  |
| `notifications:unsubscribe.title` | Deixar de rebre aquests comunicats | B24 | — |  |
| `notifications:unsubscribe.toPreferences` | Canvia els teus avisos al perfil | B24 | — |  |
| `notifications:unsubscribe.working` | Un moment… | B24 | — |  |

## 01 · 02 · 03b — accés, activació, tria de perfil i marc de l'app

| Clau | Text (ca) | Font | Registre | També a |
|---|---|---|---|---|
| `auth:access.accessDisabled` | El teu accés està desactivat. Contacta amb el club | B25 | — |  |
| `auth:access.countdown` | Massa intents. Torna-ho a provar d'aquí a {seconds} s | B25 | — |  |
| `auth:access.emailLabel` | Correu electrònic | B25 | — | Marc del backoffice (accés, menú, estats de càrrega i d'error) |
| `auth:access.emailRequired` | Escriu el teu correu | B25 | — | Marc del backoffice (accés, menú, estats de càrrega i d'error) |
| `auth:access.entering` | ENTRANT… | B25 | — | Marc del backoffice (accés, menú, estats de càrrega i d'error) |
| `auth:access.genericError` | No s'ha pogut completar l'accés. Torna-ho a provar. | B25 | — | Marc del backoffice (accés, menú, estats de càrrega i d'error) |
| `auth:access.invalidCredentials` | Correu o contrasenya incorrectes | B25 | — |  |
| `auth:access.neutralSuccess` | Si el correu és al club, hi rebràs l'enllaç | B25 | — | Marc del backoffice (accés, menú, estats de càrrega i d'error) |
| `auth:access.noMembership` | Aquest correu no pertany a {club} | B25 | — |  |
| `auth:activation.invalidDescription` | Demana un altre enllaç per tornar a entrar. | B25 | — | Marc del backoffice (accés, menú, estats de càrrega i d'error) |
| `auth:activation.invalidTitle` | Aquest enllaç ja no és vàlid | B25 | — | Marc del backoffice (accés, menú, estats de càrrega i d'error) |
| `auth:activation.loading` | Validant l'enllaç… | B25 | — | Marc del backoffice (accés, menú, estats de càrrega i d'error) |
| `auth:activation.optionalPassword` | La contrasenya és opcional: sempre pots entrar amb l'enllaç del correu. La sessió queda oberta en aquest dispositiu. | B25 | — |  |
| `auth:activation.passwordSaved` | Contrasenya desada | B25 | — |  |
| `auth:activation.resend` | Envia-me'n un de nou | B25 | — | Marc del backoffice (accés, menú, estats de càrrega i d'error) |
| `auth:activation.resetLinkUsed` | L'enllaç ja s'ha fet servir: demana'n un altre | B25 | — |  |
| `auth:activation.savingPassword` | DESANT… | B25 | — |  |
| `auth:activation.welcome` | {gender, select, FEMALE {Benvinguda, {name}!} OTHER {Hola, {name}!} other {Benvingut, {name}!}} | B25 | — |  |
| `auth:impersonation.banner` | Estàs veient l'app com {member} | B25 | — |  |
| `auth:impersonation.expired` | La sessió com l'abonat ha caducat | B25 | — |  |
| `auth:profile.adminProfile` | {gender, select, FEMALE {administradora} OTHER {administrador/a} other {administrador}} | B25 | — |  |
| `auth:profile.currentPassword` | contrasenya actual | B25 | — |  |
| `auth:profile.instructorProfile` | {gender, select, FEMALE {instructora} OTHER {instructor/a} other {instructor}} | B25 | — |  |
| `auth:profile.languageHelp` | Els avisos nous et arribaran en aquest idioma | B25 | — |  |
| `auth:profile.learnLink` | Aprèn amb AgilityHub | B25 | — |  |
| `auth:profile.memberProfile` | {gender, select, FEMALE {alumna} OTHER {alumne/a} other {alumne}} | B25 | — |  |
| `auth:profile.passwordSaved` | Contrasenya desada | B25 | — |  |
| `auth:profile.working` | S'està completant l'acció… | B25 | — |  |
| `auth:profileChoice.admin` | {gender, select, FEMALE {Com a administradora} OTHER {Com a administrador/a} other {Com a administrador}} | B25 | — |  |
| `auth:profileChoice.error` | No s'ha pogut canviar de perfil. | B25 | — |  |
| `auth:profileChoice.instructor` | {gender, select, FEMALE {Com a instructora} OTHER {Com a instructor/a} other {Com a instructor}} | B25 | — |  |
| `auth:profileChoice.member` | {gender, select, FEMALE {Com a alumna} OTHER {Com a alumne/a} other {Com a alumne}} | B25 | — |  |
| `auth:profileChoice.saving` | Canviant de perfil… | B25 | — |  |
| `common:boot.offline` | No hi ha connexió amb el servidor. | B25 | aprovat (A39.199) | Marc del backoffice (accés, menú, estats de càrrega i d'error) |
| `common:screen.failed` | No s'ha pogut mostrar aquesta pantalla. | B25 | aprovat (A39.211) | Marc del backoffice (accés, menú, estats de càrrega i d'error) |
| `common:screen.reload` | Torna a carregar | B25 | — | Marc del backoffice (accés, menú, estats de càrrega i d'error) |
| `common:screen.updated` | L'aplicació s'ha actualitzat. Torna a carregar-la. | B25 | aprovat (A39.210) | Marc del backoffice (accés, menú, estats de càrrega i d'error) |
| `shell:header.userMenu` | Menú d’usuari | B25 | — | Marc del backoffice (accés, menú, estats de càrrega i d'error) |
| `shell:language.en` | Anglès | B25 | — | Marc del backoffice (accés, menú, estats de càrrega i d'error) |
| `shell:loading` | Carregant | B25 | aprovat (A39.204) | Marc del backoffice (accés, menú, estats de càrrega i d'error) |
| `shell:nav.main` | Navegació principal | B25 | — |  |
| `shell:placeholder.description` | Aquesta pantalla estarà disponible aviat. | B25 | — | Marc del backoffice (accés, menú, estats de càrrega i d'error) |

## D2 — validació d'una preinscripció

| Clau | Text (ca) | Font | Registre | També a |
|---|---|---|---|---|
| `admin-census:dog.documents.type` | Tipus de document | B25 | — | D10 — fitxa d'abonat |
| `admin-census:dog.documents.upload` | Puja el document | B25 | — | D10 — fitxa d'abonat |
| `admin-census:signupReview.actions.reload` | Torna a carregar | B25 | — |  |
| `admin-census:signupReview.confirmNothingPaid` | Confirma que no s'ha cobrat cap import | B25 | — |  |
| `admin-census:signupReview.datePlaceholder` | dd/mm/aaaa | B25 | — |  |
| `admin-census:signupReview.editTitle` | Edita les dades de la preinscripció | B25 | — |  |
| `admin-census:signupReview.familyAttach` | Afegeix al grup de {name} | B25 | — |  |
| `admin-census:signupReview.familyChosen` | Grup de {name} | B25 | — |  |
| `admin-census:signupReview.familyDecisionRequired` | Tria el grup del titular o «Sense grup». | B25 | — |  |
| `admin-census:signupReview.familyNoGroup` | {name}: sense grup familiar | B25 | — |  |
| `admin-census:signupReview.familyNone` | Sense grup | B25 | — |  |
| `admin-census:signupReview.familyNoResults` | Cap abonat amb aquest nom | B25 | — |  |
| `admin-census:signupReview.familyPending` | Pendent — ha indicat: {holder} + gos {dog} | B25 | — |  |
| `admin-census:signupReview.familySearch` | Cerca el titular | B25 | — |  |
| `admin-census:signupReview.fields.birthMonth` | Mes de naixement | B25 | — |  |
| `admin-census:signupReview.fields.contactEmails` | Correus electrònics | B25 | — |  |
| `admin-census:signupReview.fields.email` | Correu electrònic | B25 | — |  |
| `admin-census:signupReview.fields.holderTaxId` | NIF del titular | B25 | — |  |
| `admin-census:signupReview.fields.lastName1` | Primer cognom | B25 | — |  |
| `admin-census:signupReview.fields.lastName2` | Segon cognom | B25 | — |  |
| `admin-census:signupReview.fields.otherDocument` | Altre document | B25 | — |  |
| `admin-census:signupReview.fields.paymentMethod` | Mètode de pagament | B25 | — |  |
| `admin-census:signupReview.fields.postalCode` | Codi postal | B25 | — |  |
| `admin-census:signupReview.fields.requestedPlan` | Modalitat sol·licitada | B25 | — |  |
| `admin-census:signupReview.fields.secondEmail` | Segon correu electrònic | B25 | — |  |
| `admin-census:signupReview.genericError` | No s'ha pogut completar l'acció. | B25 | — |  |
| `admin-census:signupReview.invalidState` | La preinscripció ja no es pot validar. | B25 | — |  |
| `admin-census:signupReview.invoiceInvalid` | La data del proper rebut no és vàlida. | B25 | — |  |
| `admin-census:signupReview.invoiceRequired` | Indica la data del proper rebut. | B25 | — |  |
| `admin-census:signupReview.levelRequired` | Selecciona el nivell inicial. | B25 | — |  |
| `admin-census:signupReview.loadError` | No s'ha pogut carregar la preinscripció. | B25 | — |  |
| `admin-census:signupReview.loading` | Carregant la preinscripció… | B25 | — |  |
| `admin-census:signupReview.newDog` | nou gos | B25 | — |  |
| `admin-census:signupReview.nothingPaid` | No s'ha cobrat res: queda pendent | B25 | — |  |
| `admin-census:signupReview.pending` | {count, plural, =0 {pendent des d'avui} one {pendent des de fa # dia} other {pendent des de fa # dies}} | B25 | — |  |
| `admin-census:signupReview.readmission.documentLocked` | El document d'identitat no es pot canviar durant una readmissió: per corregir-lo, rebutja la readmissió. | B25 | — |  |
| `admin-census:signupReview.readmission.dogLocked` | La readmissió està pendent: la fitxa del gos no es pot canviar fins que es validi o es rebutgi. | B25 | — |  |
| `admin-census:signupReview.readmission.title` | Canvis respecte de la fitxa de baixa | B25 | — |  |
| `admin-census:signupReview.refundWarning` | Hi ha un pagament cobrat: caldrà retornar-lo des de Facturació | B25 | — |  |
| `admin-census:signupReview.rejectHelp` | Entre 3 i 500 caràcters. | B25 | — |  |
| `admin-census:signupReview.rejectReason` | Motiu del rebuig | B25 | — |  |
| `admin-census:signupReview.rejectTitle` | Rebutja la preinscripció | B25 | — |  |
| `admin-census:signupReview.resolved` | Aquesta preinscripció ja s'ha resolt | B25 | — |  |
| `admin-census:signupReview.resolvedLink` | Obre la fitxa de l'abonat | B25 | — |  |
| `admin-census:signupReview.saved` | Les dades s'han actualitzat. | B25 | — |  |
| `admin-census:signupReview.stale` | La preinscripció ha canviat. Torna-la a carregar. | B25 | — |  |
| `admin-census:signupReview.upfrontLines.ADDITIONAL_DOG_FEE` | Quota de gos addicional {amount} | B25 | — |  |
| `admin-census:signupReview.upfrontLines.FIRST_MONTH_UNKNOWN` | Primera quota {amount} | B25 | — |  |
| `admin-census:signupReview.warning.CHECKOUT_PENDING` | Hi ha un pagament amb targeta en curs: la modalitat no es pot canviar fins que acabi. | B25 | — |  |
| `admin-census:signupReview.warning.DOCUMENT_PENDING` | Document pendent | B25 | — |  |
| `admin-census:signupReview.warning.FAMILY_HOLDER_NOT_FOUND` | No s'ha trobat el titular del grup familiar | B25 | — |  |
| `admin-census:signupReview.warning.NO_IMAGE_CONSENT` | No autoritza l'ús de la seva imatge: no publiquis fotos on surti {gender, select, FEMALE {ella} OTHER {aquesta persona} other {ell}}. | B25 | — |  |
| `admin-census:signupReview.warning.PAID_EXCEEDS_QUOTE` | El que s'ha cobrat supera el nou import: caldrà retornar la diferència des de Facturació. | B25 | — |  |
| `admin-census:signupReview.warning.READMISSION` | Readmissió | B25 | — |  |
| `admin-census:signupReview.warning.UPFRONT_UNPAID` | Pagament inicial pendent | B25 | — |  |

## D1 — tauler

| Clau | Text (ca) | Font | Registre | També a |
|---|---|---|---|---|
| `admin-census:member.readmissionPending` | Aquest abonat té una readmissió pendent: valida-la o rebutja-la des del tauler abans de canviar la fitxa. | B25 | — |  |
| `admin-dashboard:chart.legendRecent` | {previous, plural, =0 {amb reserva (setm. en curs)} one {amb reserva (setm. en curs o anterior)} other {amb reserva (setm. en curs o les # anteriors)}} | B25 | — |  |
| `admin-dashboard:common.error` | No s'ha pogut carregar el tauler. | B25 | — |  |
| `admin-dashboard:common.loading` | Carregant el tauler | B25 | — |  |
| `admin-dashboard:greeting` | {period, select, morning {Bon dia!} afternoon {Bona tarda!} other {Bon vespre!}} {date} | B25 | — |  |
| `admin-dashboard:risk.empty` | Cap classe en risc | B25 | — |  |
| `admin-dashboard:risk.error` | No s'ha pogut carregar la revisió de classes en risc. | B25 | — |  |
| `admin-dashboard:risk.loading` | Carregant la revisió de classes en risc… | B25 | — |  |
| `admin-dashboard:risk.status.WILL_REVIEW` | el club decidirà | B25 | — |  |
| `admin-dashboard:signups.dog` | {name} {isAddDog, select, true {(nou gos)} other {({breed})}} | B25 | — |  |
| `admin-dashboard:signups.empty` | Cap preinscripció pendent | B25 | — |  |
| `admin-dashboard:signups.refundRequired` | Hi ha un pagament cobrat: caldrà retornar-lo des de Facturació | B25 | — |  |
| `admin-dashboard:signups.submitted` | enviada el {date} | B25 | — |  |
| `admin-dashboard:signups.validated` | L'alta s'ha validat. | B25 | — |  |

## D3 · D3b — plantilles

| Clau | Text (ca) | Font | Registre | També a |
|---|---|---|---|---|
| `admin-scheduling:common.error` | No s'ha pogut completar l'acció. | B25 | — | D4 · D4b · D4c — calendari de classes |
| `admin-scheduling:common.loading` | Carregant… | B25 | — | D4 · D4b · D4c — calendari de classes |
| `admin-scheduling:common.saving` | Desant… | B25 | — | D4 · D4b · D4c — calendari de classes |
| `admin-scheduling:templates.addAnotherInBand` | Vols afegir-ne una altra a la mateixa franja? | B25 | — |  |
| `admin-scheduling:templates.bandForm.closedDays` | Dies de tancament: {days}. Aquesta plantilla no admet franges. | B25 | — |  |
| `admin-scheduling:templates.bandForm.newTitle` | Nova franja | B25 | — |  |
| `admin-scheduling:templates.bandForm.remove` | Esborra la franja | B25 | — |  |
| `admin-scheduling:templates.day.next` | Dia següent | B25 | — | D4 · D4b · D4c — calendari de classes |
| `admin-scheduling:templates.day.previous` | Dia anterior | B25 | — | D4 · D4b · D4c — calendari de classes |
| `admin-scheduling:templates.empty.description` | Crea la primera plantilla per dissenyar l'oferta setmanal de classes. | B25 | — |  |
| `admin-scheduling:templates.empty.title` | Encara no hi ha cap plantilla | B25 | — |  |
| `admin-scheduling:templates.form.copyName` | {name} (còpia) | B25 | — |  |
| `admin-scheduling:templates.form.duplicateTitle` | Duplica la plantilla | B25 | — |  |
| `admin-scheduling:templates.generation.done` | {count, plural, one {# classe generada} other {# classes generades}} | B25 | — |  |
| `admin-scheduling:templates.generation.skipped` | {count, plural, one {# omesa} other {# omeses}} ({reasons}) | B25 | — |  |
| `admin-scheduling:templates.gridLabel` | Quadre setmanal de la plantilla «{name}» | B25 | — |  |
| `admin-scheduling:weeks.empty` | Encara no hi ha cap setmana | B25 | — |  |
| `enums:coverageStatus.NO_DOGS` | sense gossos | B25 | — |  |
| `enums:inconsistencyType.INSTRUCTOR_DOUBLE_BOOKED` | Instructor assignat a dues classes alhora | B25 | — | D4 · D4b · D4c — calendari de classes |
| `enums:inconsistencyType.INSTRUCTOR_INACTIVE` | Instructor desactivat | B25 | — | D4 · D4b · D4c — calendari de classes |
| `enums:inconsistencyType.LEVEL_INACTIVE` | Nivell desactivat | B25 | — | D4 · D4b · D4c — calendari de classes |
| `enums:inconsistencyType.RING_DOUBLE_BOOKED` | Pista amb dues classes alhora | B25 | — | D4 · D4b · D4c — calendari de classes |
| `enums:inconsistencyType.RING_INACTIVE` | Pista desactivada | B25 | — | D4 · D4b · D4c — calendari de classes |
| `enums:inconsistencyType.RING_TRAINING_CONFLICT` | Pista amb reserves d'entrenament | B25 | — | D4 · D4b · D4c — calendari de classes |
| `enums:skipReason.HOLIDAY` | festiu | B25 | — |  |
| `enums:skipReason.PAST` | dies passats | B25 | — |  |

## D4 · D4b · D4c — calendari de classes

| Clau | Text (ca) | Font | Registre | També a |
|---|---|---|---|---|
| `admin-scheduling:calendar.blockForm.cancel` | Anul·la el bloqueig | B25 | — |  |
| `admin-scheduling:calendar.blockForm.cancelledDone` | Bloqueig anul·lat | B25 | — |  |
| `admin-scheduling:calendar.blockForm.conflicts` | Coincideix amb: | B25 | — |  |
| `admin-scheduling:calendar.blockForm.editTitle` | Bloqueig de pista | B25 | — |  |
| `admin-scheduling:calendar.blockForm.managedByActivity` | Aquest bloqueig es gestiona des de l'activitat. | B25 | — |  |
| `admin-scheduling:calendar.blockForm.openActivity` | Obre l'activitat | B25 | — |  |
| `admin-scheduling:calendar.blockForm.saved` | Bloqueig desat | B25 | — |  |
| `admin-scheduling:calendar.blockForm.submit` | DESA EL BLOQUEIG | B25 | — |  |
| `admin-scheduling:calendar.closedDay` | El club està tancat aquest dia | B25 | — |  |
| `admin-scheduling:calendar.createForm.datePlaceholder` | dd/mm/aaaa | B25 | — |  |
| `admin-scheduling:calendar.createForm.done` | Classe creada | B25 | — |  |
| `admin-scheduling:calendar.createForm.holiday` | Aquest dia és festiu | B25 | — |  |
| `admin-scheduling:calendar.createForm.invalidDate` | Escriu una data vàlida (dd/mm/aaaa). | B25 | — |  |
| `admin-scheduling:calendar.createForm.visibleNow` | Els alumnes la veuran de seguida | B25 | — |  |
| `admin-scheduling:calendar.day.empty` | Cap classe aquest dia | B25 | — |  |
| `admin-scheduling:calendar.deleted` | Classe eliminada | B25 | — |  |
| `admin-scheduling:calendar.empty` | Cap classe aquesta setmana | B25 | — |  |
| `admin-scheduling:calendar.filter.label` | Estat de les classes | B25 | — |  |
| `admin-scheduling:calendar.gridLabel` | Calendari de classes · del {range} | B25 | — |  |
| `admin-scheduling:calendar.ringBookings.confirm` | Anul·la les reserves i desa | B25 | — | Entrenaments i bloquejos de pista (backoffice) |
| `admin-scheduling:calendar.ringBookings.text` | Si continues, aquestes reserves quedaran anul·lades pel club i se'n farà l'avís: | B25 | — | Entrenaments i bloquejos de pista (backoffice) |
| `admin-scheduling:calendar.ringBookings.title` | Aquesta pista té reserves d'entrenament | B25 | — | Entrenaments i bloquejos de pista (backoffice) |
| `admin-scheduling:calendar.saved` | Canvis desats | B25 | — |  |
| `admin-scheduling:calendar.selected.exempt` | Exempta de la revisió{time, select, none {} other { de les {time}}} | B25 | — |  |
| `admin-scheduling:calendar.selected.noInstructor` | Sense instructor | B25 | — |  |
| `admin-scheduling:calendar.validation.done` | {count, plural, one {# classe validada} other {# classes validades}} | B25 | — |  |
| `admin-scheduling:calendar.validation.help` | {count, plural, one {En validar, la classe passa a activa i els alumnes ja la poden reservar. No es pot validar una classe sola.} other {En validar, les # classes passen a actives alhora i els alumnes ja les poden reservar. No es pot validar una classe sola.}} | B25 | — |  |
| `admin-scheduling:calendar.week.previous` | Setmana anterior | B25 | — |  |
| `admin-scheduling:cancelModal.confirm` | {count, plural, one {ANUL·LA I AVISA L'ALUMNE} other {ANUL·LA I AVISA ELS # ALUMNES}} | B25 | — |  |
| `admin-scheduling:cancelModal.confirmWaitlist` | ANUL·LA I AVISA LA LLISTA D'ESPERA | B25 | — |  |
| `admin-scheduling:cancelModal.intro` | Aquesta classe té {count, plural, one {# alumne inscrit} other {# alumnes inscrits}}. Si l'anul·les, rebran un avís a l'app, per correu i per SMS amb el text que escriguis a sota. | B25 | — |  |
| `admin-scheduling:cancelModal.introCount` | {count, plural, one {# alumne inscrit} other {# alumnes inscrits}} | B25 | — |  |
| `admin-scheduling:cancelModal.introWaitlist` | Aquesta classe no té alumnes inscrits, però té {count, plural, one {# alumne a la llista d'espera} other {# alumnes a la llista d'espera}}. Si l'anul·les, rebran un avís a l'app, per correu i per SMS amb el text que escriguis a sota. | B25 | — |  |
| `admin-scheduling:cancelModal.introWaitlistCount` | {count, plural, one {# alumne a la llista d'espera} other {# alumnes a la llista d'espera}} | B25 | — |  |
| `admin-scheduling:cancelModal.simpleCancel` | Vols anul·lar la classe? | B25 | — |  |
| `admin-scheduling:cancelModal.simpleDelete` | Vols eliminar la classe? | B25 | — |  |
| `admin-scheduling:classCard.instructors` | Instructors (màx. {max}) | B25 | — |  |
| `admin-scheduling:classCard.remove` | Treu de la plantilla | B25 | — |  |
| `admin-scheduling:plannedCourse.error` | No s'han pogut carregar els recorreguts de la pista. | B25 | — |  |
| `admin-scheduling:plannedCourse.label` | Recorregut previst | B25 | — |  |
| `admin-scheduling:plannedCourse.loading` | Carregant… | B25 | — |  |
| `admin-scheduling:plannedCourse.unknown` | Una col·locació d'una altra pista | B25 | — |  |
| `admin-scheduling:registrants.empty` | Encara no hi ha cap inscrit. | B25 | — |  |
| `admin-scheduling:registrants.loadError` | No s'han pogut carregar els inscrits. | B25 | — |  |
| `admin-scheduling:registrants.loading` | Carregant els inscrits… | B25 | — |  |
| `admin-scheduling:registrants.remove` | Treu de la llista | B25 | — |  |
| `admin-scheduling:registrants.removeConfirm.confirm` | Treu de la llista | B25 | — |  |
| `admin-scheduling:registrants.removeConfirm.text` | {name} deixarà d'estar en espera d'aquesta classe. | B25 | — |  |
| `admin-scheduling:registrants.removeConfirm.title` | Treure de la llista d'espera | B25 | — |  |
| `admin-scheduling:registrants.removeLabel` | Treu {name} de la llista d'espera | B25 | — |  |
| `enums:cancellationReason.DELETED` | eliminada | B25 | — |  |

## Inactivitats i baixes (pàgina nova)

| Clau | Text (ca) | Font | Registre | També a |
|---|---|---|---|---|
| `admin-census:common.genericError` | No s'ha pogut completar l'acció. | B25 | — | D10 — fitxa d'abonat; D9 — comunicats i plantilles d'avís |
| `admin-census:common.loading` | Carregant la fitxa… | B25 | — | D10 — fitxa d'abonat |
| `admin-census:inactivityLeavePage.addFilter` | Afegeix el filtre | B24 | — |  |
| `admin-census:inactivityLeavePage.clearFilters` | Neteja els filtres | B24 | — |  |
| `admin-census:inactivityLeavePage.createView` | Crea la vista | B24 | — |  |
| `admin-census:inactivityLeavePage.defaultView` | Vista predeterminada | B24 | — |  |
| `admin-census:inactivityLeavePage.deleteView` | Elimina la vista | B24 | — |  |
| `admin-census:inactivityLeavePage.filterOperator` | Operador | B24 | — |  |
| `admin-census:inactivityLeavePage.inactivity.emptyDescription` | No hi ha períodes amb aquests criteris. | B24 | — |  |
| `admin-census:inactivityLeavePage.inactivity.emptyTitle` | No hi ha inactivitats | B24 | — |  |
| `admin-census:inactivityLeavePage.inactivity.search` | Cerca inactivitats | B24 | — |  |
| `admin-census:inactivityLeavePage.leave.emptyDescription` | No hi ha sol·licituds amb aquests criteris. | B24 | — |  |
| `admin-census:inactivityLeavePage.leave.emptyTitle` | No hi ha baixes | B24 | — |  |
| `admin-census:inactivityLeavePage.leave.search` | Cerca baixes | B24 | — |  |
| `admin-census:inactivityLeavePage.loadingFilterValues` | Carregant valors… | B24 | — |  |
| `admin-census:inactivityLeavePage.nextPage` | Pàgina següent | B24 | — |  |
| `admin-census:inactivityLeavePage.noSavedView` | Sense vista desada | B24 | — |  |
| `admin-census:inactivityLeavePage.nps` | NPS | B24 | — |  |
| `admin-census:inactivityLeavePage.operators.contains` | conté | B24 | — |  |
| `admin-census:inactivityLeavePage.operators.gt` | més gran que | B24 | — |  |
| `admin-census:inactivityLeavePage.operators.gte` | com a mínim | B24 | — |  |
| `admin-census:inactivityLeavePage.operators.lt` | més petit que | B24 | — |  |
| `admin-census:inactivityLeavePage.operators.nin` | cap de | B24 | — |  |
| `admin-census:inactivityLeavePage.operators.startsWith` | comença per | B24 | — |  |
| `admin-census:inactivityLeavePage.origin` | Origen | B24 | — |  |
| `admin-census:inactivityLeavePage.previousPage` | Pàgina anterior | B24 | — |  |
| `admin-census:inactivityLeavePage.removeFilter` | Elimina el filtre {field} | B24 | — |  |
| `admin-census:inactivityLeavePage.renameView` | Canvia el nom | B24 | — |  |
| `admin-census:inactivityLeavePage.requestedAt` | Sol·licitat el | B24 | — |  |
| `admin-census:inactivityLeavePage.requestedDate` | Data demanada | B24 | — |  |
| `admin-census:inactivityLeavePage.saveError` | No s'ha pogut desar la vista. | B24 | — |  |
| `admin-census:inactivityLeavePage.saveViewName` | Nom de la vista | B24 | — |  |
| `admin-census:inactivityLeavePage.selectAll` | Selecciona-ho tot | B24 | — |  |
| `admin-census:inactivityLeavePage.sharedView` | Vista compartida | B24 | — |  |
| `admin-census:inactivityLeavePage.sortAscending` | Ordena {column} ascendent | B24 | — |  |
| `admin-census:inactivityLeavePage.sortDescending` | Ordena {column} descendent | B24 | — |  |
| `enums:inactivityState.APPROVED` | aprovat | B25 | — | D10 — fitxa d'abonat |
| `enums:inactivityState.CANCELLED` | anul·lat | B25 | — | D10 — fitxa d'abonat |
| `enums:inactivityState.DENIED` | denegat | B25 | — | D10 — fitxa d'abonat |
| `enums:inactivityState.FINISHED` | finalitzat | B25 | — | D10 — fitxa d'abonat |
| `enums:inactivityState.REQUESTED` | sol·licitat | B25 | — | D10 — fitxa d'abonat |
| `enums:leaveRequestState.DENIED` | denegada | B24 | — |  |
| `enums:leaveSource.MEMBER` | sol·licitud de l'abonat | B25 | — | D5 · D15 — llistats d'abonats i de gossos; D10 — fitxa d'abonat |
| `enums:leaveSource.MIGRATED` | migració | B25 | — | D5 · D15 — llistats d'abonats i de gossos; D10 — fitxa d'abonat |
| `enums:leaveSource.PACK_EXPIRED` | caducitat del pack | B25 | — | D5 · D15 — llistats d'abonats i de gossos; D10 — fitxa d'abonat |

## D5 · D15 — llistats d'abonats i de gossos

| Clau | Text (ca) | Font | Registre | També a |
|---|---|---|---|---|
| `admin-census:member.documentPending` | Document pendent | B25 | — | D10 — fitxa d'abonat |
| `census:dogs.columns.age` | Edat | B25 | — |  |
| `census:dogs.columns.levelAssignedAt` | Al nivell des de | B25 | — |  |
| `census:dogs.columns.pendingDocuments` | Documents pendents | B25 | — |  |
| `census:dogs.columns.registeredAt` | Data d'alta | B25 | — |  |
| `census:dogs.emptyDescription` | Canvieu la cerca o els filtres per veure més resultats. | B25 | — |  |
| `census:dogs.emptyTitle` | Cap gos amb aquests criteris | B25 | — |  |
| `census:dogs.filters.hasPendingDocuments` | Documents pendents | B25 | — |  |
| `census:dogs.filters.licenseOrganisation` | Organisme de llicència | B25 | — |  |
| `census:dogs.filters.ownerName` | Nom de l'abonat | B25 | — |  |
| `census:dogs.statusLabel` | Estat dels gossos | B25 | — |  |
| `census:list.genericError` | No s'ha pogut carregar el llistat. | B25 | — |  |
| `census:list.ownersMissing` | No s'han pogut llegir els propietaris de {count, plural, one {# gos} other {# gossos}} de la selecció. Torna-ho a provar. | B25 | — |  |
| `census:members.columns.bookingBlocked` | Reserves bloquejades | B25 | — |  |
| `census:members.columns.leaveSource` | Origen de la baixa | B25 | — |  |
| `census:members.columns.pendingDocuments` | Documents pendents | B25 | — |  |
| `census:members.emptyDescription` | Canvieu la cerca o els filtres per veure més resultats. | B25 | — |  |
| `census:members.emptyTitle` | Cap abonat amb aquests criteris | B25 | — |  |
| `census:members.filters.bookingBlocked` | Reserves bloquejades | B25 | — |  |
| `census:members.filters.displayStatus` | Estat visible | B25 | — |  |
| `census:members.filters.hasPendingDocuments` | Documents pendents | B25 | — |  |
| `census:members.filters.hasPendingRequest` | Sol·licitud pendent | B25 | — |  |
| `census:members.filters.paymentMethodType` | Mètode de pagament | B25 | — |  |
| `census:members.search` | Cerca per nom, document, gos… | B25 | — |  |
| `census:members.statusLabel` | Estat dels abonats | B25 | — |  |

## D10 — fitxa d'abonat

| Clau | Text (ca) | Font | Registre | També a |
|---|---|---|---|---|
| `admin-census:bookings.actAsMember` | Per reservar o anul·lar en nom seu, fes servir «Entra com l'abonat». | B25 | — |  |
| `admin-census:bookings.columns.origin` | Origen | B25 | — |  |
| `admin-census:bookings.error` | No s'han pogut carregar les reserves. | B25 | — |  |
| `admin-census:bookings.loading` | Carregant les reserves… | B25 | — |  |
| `admin-census:bookings.loadingMore` | Carregant més reserves | B25 | — |  |
| `admin-census:bookings.noClasses` | Cap reserva de classe. | B25 | — |  |
| `admin-census:bookings.noTrainings` | Cap reserva d'entrenament. | B25 | — |  |
| `admin-census:bookings.seeAll` | Veure'ls tots › | B25 | — |  |
| `admin-census:bookings.showMore` | Mostra'n més | B25 | — |  |
| `admin-census:common.choose` | Tria una opció | B25 | — |  |
| `admin-census:common.loadError` | No s'ha pogut carregar la fitxa. | B25 | — |  |
| `admin-census:common.saving` | Desant… | B25 | — | D9 — comunicats i plantilles d'avís |
| `admin-census:dog.actions.changeLevel` | Canvia el nivell | B25 | — |  |
| `admin-census:dog.actions.deactivate` | Dona de baixa | B25 | — |  |
| `admin-census:dog.actions.photo` | Canvia la foto | B25 | — |  |
| `admin-census:dog.actions.reactivate` | Reactiva | B25 | — |  |
| `admin-census:dog.actions.transfer` | Transfereix | B25 | — |  |
| `admin-census:dog.deactivate.description` | Les reserves futures poden impedir la baixa. Les dades i l'historial es conservaran. | B25 | — |  |
| `admin-census:dog.deactivate.title` | Dona de baixa el gos | B25 | — |  |
| `admin-census:dog.documents.name` | Nom del document | B25 | — |  |
| `admin-census:dog.documents.remind` | Recorda la cartilla | B25 | — |  |
| `admin-census:dog.edit.title` | Edita les dades del gos | B25 | — |  |
| `admin-census:dog.feedback.deactivated` | El gos s'ha donat de baixa. | B25 | — |  |
| `admin-census:dog.feedback.documentRemoved` | El fitxer s'ha retirat. | B25 | — |  |
| `admin-census:dog.feedback.documentUploaded` | El document s'ha pujat. | B25 | — |  |
| `admin-census:dog.feedback.freeTraining` | El dret d'entrenament lliure s'ha actualitzat. | B25 | — |  |
| `admin-census:dog.feedback.levelSaved` | El nivell s'ha actualitzat. | B25 | — |  |
| `admin-census:dog.feedback.photo` | La foto s'ha actualitzat. | B25 | — |  |
| `admin-census:dog.feedback.reactivated` | El gos s'ha reactivat. | B25 | — |  |
| `admin-census:dog.feedback.reminderSent` | El recordatori s'ha enviat. | B25 | — |  |
| `admin-census:dog.feedback.saved` | Les dades del gos s'han desat. | B25 | — |  |
| `admin-census:dog.feedback.transferred` | El gos s'ha transferit. | B25 | — |  |
| `admin-census:dog.fields.licenseCategory` | Categoria de la llicència {number} | B25 | — |  |
| `admin-census:dog.fields.licenseDivision` | Divisió de la llicència {number} | B25 | — |  |
| `admin-census:dog.fields.licenseGrade` | Grau de la llicència {number} | B25 | — |  |
| `admin-census:dog.fields.licenseNumber` | Número de la llicència {number} | B25 | — |  |
| `admin-census:dog.fields.licenseOrganisation` | Organisme de la llicència {number} | B25 | — |  |
| `admin-census:dog.freeTraining.byLevel` | El dret ve del nivell. | B25 | — |  |
| `admin-census:dog.freeTraining.levelOption` | Segons el nivell | B25 | — |  |
| `admin-census:dog.freeTraining.manual` | Decisió manual del club. | B25 | — |  |
| `admin-census:dog.freeTraining.notAllowed` | No pot entrenar sol | B25 | — |  |
| `admin-census:dog.level.select` | Nivell nou | B25 | — |  |
| `admin-census:dog.level.title` | Canvia el nivell | B25 | — |  |
| `admin-census:dog.photo.empty` | Encara no hi ha cap foto | B25 | — |  |
| `admin-census:dog.photo.file` | Fitxer d'imatge | B25 | — |  |
| `admin-census:dog.reactivate.description` | El gos tornarà a estar disponible si l'abonat continua d'alta. | B25 | — |  |
| `admin-census:dog.reactivate.title` | Reactiva el gos | B25 | — |  |
| `admin-census:dog.sections.data` | Dades del gos | B25 | — |  |
| `admin-census:dog.sections.level` | Nivell i historial | B25 | — |  |
| `admin-census:dog.status.reason` | Motiu (opcional) | B25 | — |  |
| `admin-census:dog.tasks.counts` | {open} pendents · {completed} fetes | B25 | — |  |
| `admin-census:dog.transfer.owner` | Abonat de destí | B25 | — |  |
| `admin-census:dog.transfer.reason` | Motiu (opcional) | B25 | — |  |
| `admin-census:dog.transfer.select` | Selecciona un abonat | B25 | — |  |
| `admin-census:dog.transfer.title` | Transfereix el gos | B25 | — |  |
| `admin-census:inactivity.approveConfirmCancel` | En aprovar, s'anul·laran les reserves que quedin dins del període. | B25 | — |  |
| `admin-census:inactivity.approveConfirmCancelCount` | En aprovar, s'anul·laran {count, plural, one {# reserva dins del període} other {# reserves dins del període}}. | B25 | — |  |
| `admin-census:inactivity.approveConfirmKeep` | En aprovar, les reserves que quedin dins del període es mantindran. | B25 | — |  |
| `admin-census:inactivity.approveConfirmTitle` | Aprova el període | B25 | — |  |
| `admin-census:inactivity.cancelledBookings` | {count, plural, one {# reserva anul·lada} other {# reserves anul·lades}} | B25 | — |  |
| `admin-census:inactivity.cancelledToast` | S'han anul·lat {count, plural, one {# reserva} other {# reserves}} | B25 | — |  |
| `admin-census:inactivity.createApprove` | Crea i aprova | B25 | — |  |
| `admin-census:inactivity.current` | Període actual | B25 | — |  |
| `admin-census:inactivity.deny` | Denega | B25 | — |  |
| `admin-census:inactivity.errors.deadline` | El primer mes possible és {month}. Marca l'opció per saltar el termini. | B25 | — |  |
| `admin-census:inactivity.errors.openExisting` | Obre el període existent | B25 | — |  |
| `admin-census:inactivity.errors.overlap` | Aquest període se solapa amb una inactivitat existent. | B25 | — |  |
| `admin-census:inactivity.modify` | Modifica els mesos | B25 | — |  |
| `admin-census:inactivity.new` | Nou període d'inactivitat | B25 | — |  |
| `admin-census:inactivity.noCancellationToast` | S'han mantingut {count, plural, one {# reserva} other {# reserves}} dins del període. | B25 | — |  |
| `admin-census:inactivity.notApplicable` | Les modalitats de pack no poden demanar inactivitat. | B25 | — |  |
| `admin-census:inactivity.overrideDeadline` | Salta el termini del dia {day} | B25 | — |  |
| `admin-census:inactivity.terminate` | Finalitza el període | B25 | — |  |
| `admin-census:inactivity.toMonth` | Mes final (— encara no ho sé) | B25 | — |  |
| `admin-census:leave.cancelledPlannedToast` | La baixa prevista s'ha anul·lat. | B25 | — |  |
| `admin-census:leave.cancelledToast` | S'han anul·lat {count, plural, one {# reserva} other {# reserves}} | B25 | — |  |
| `admin-census:leave.cancelPlanned` | Anul·la la baixa prevista | B25 | — |  |
| `admin-census:leave.cancelPlannedConfirm` | Vols anul·lar aquesta baixa prevista? | B25 | — |  |
| `admin-census:leave.confirm` | Programa la baixa | B25 | — |  |
| `admin-census:leave.deny` | Denega | B25 | — |  |
| `admin-census:leave.direct` | Programa la baixa | B25 | — |  |
| `admin-census:leave.directWarning` | Si hi ha una sol·licitud pendent, quedarà anul·lada. | B25 | — |  |
| `admin-census:leave.errors.dateInvalid` | La data demanada ja ha passat: tria'n una de nova | B25 | — |  |
| `admin-census:leave.nps` | NPS: {value} | B25 | — |  |
| `admin-census:leave.pending` | Sol·licitud pendent | B25 | — |  |
| `admin-census:leave.planned` | Baixa prevista el {date} | B25 | — |  |
| `admin-census:leave.reason` | Motiu (opcional) | B25 | — |  |
| `admin-census:member.actions.unblock` | Desbloqueja les reserves | B25 | — |  |
| `admin-census:member.billing.allReceipts` | Tots els rebuts › | B25 | — |  |
| `admin-census:member.billing.amountDue` | Import degut | B25 | — |  |
| `admin-census:member.billing.amountExceeds` | L'import pagat no pot superar l'import degut. | B25 | — |  |
| `admin-census:member.billing.amountPaid` | Import pagat | B25 | — |  |
| `admin-census:member.billing.delta` | Variació de sessions | B25 | — |  |
| `admin-census:member.billing.expiresOn` | Nova caducitat | B25 | — |  |
| `admin-census:member.billing.invalidCard` | Targeta no vàlida | B25 | — |  |
| `admin-census:member.billing.nextInvoice.edit` | Edita la data del proper rebut | B25 | — |  |
| `admin-census:member.billing.nextInvoice.none` | Sense data: no es facturarà | B25 | — |  |
| `admin-census:member.billing.nextInvoice.notBefore` | La data no pot ser anterior al {date}. | B25 | — |  |
| `admin-census:member.billing.nextInvoice.range` | Tria una data entre el {from} i el {to}. | B25 | — |  |
| `admin-census:member.billing.packExpiredLine` | {consumed} consumides · caducat el {date} | B25 | — |  |
| `admin-census:member.billing.packLine` | {consumed} consumides · {remaining} disponibles · caduca el {date} | B25 | — |  |
| `admin-census:member.billing.packNegative` | L'ajust no pot deixar el pack amb sessions negatives. | B25 | — |  |
| `admin-census:member.billing.paidAt` | Data de pagament | B25 | — |  |
| `admin-census:member.billing.planNotPack` | Aquest concepte necessita una modalitat de pack. | B25 | — |  |
| `admin-census:member.billing.recordPayment` | Registra un pagament | B25 | — |  |
| `admin-census:member.billing.reference` | Referència (opcional) | B25 | — |  |
| `admin-census:member.billing.upfront` | Pagaments a l'acte | B25 | — |  |
| `admin-census:member.block.description` | El bloqueig impedeix reserves noves i mostra aquest motiu a l'abonat. Les reserves existents es mantenen. | B25 | — |  |
| `admin-census:member.block.reason` | Motiu del bloqueig | B25 | — | Auditoria |
| `admin-census:member.bookingBlocked` | Reserves bloquejades | B25 | — | Auditoria |
| `admin-census:member.edit.title` | Edita l'abonat | B25 | — |  |
| `admin-census:member.familyMember` | membre del grup familiar | B25 | — |  |
| `admin-census:member.feedback.accessSent` | Enllaç enviat a {email} | B25 | — |  |
| `admin-census:member.feedback.blocked` | Les reserves s'han bloquejat. | B25 | — |  |
| `admin-census:member.feedback.payment` | El mètode de pagament s'ha actualitzat. | B25 | — |  |
| `admin-census:member.feedback.roles` | Els rols d'accés s'han actualitzat. | B25 | — |  |
| `admin-census:member.feedback.saved` | Les dades de l'abonat s'han desat. | B25 | — |  |
| `admin-census:member.feedback.unblocked` | Les reserves s'han desbloquejat. | B25 | — |  |
| `admin-census:member.fields.billingMode` | Mode de facturació | B25 | — |  |
| `admin-census:member.fields.documentType` | Tipus de document | B25 | — |  |
| `admin-census:member.fields.emails` | Correus electrònics | B25 | — |  |
| `admin-census:member.fields.lastName1` | Primer cognom | B25 | — | Auditoria |
| `admin-census:member.fields.lastName2` | Segon cognom | B25 | — | Auditoria |
| `admin-census:member.fields.remarks` | Observacions visibles | B25 | — | Auditoria |
| `admin-census:member.imageNotice` | No autoritza l'ús de la seva imatge: no publiquis fotos on surti {gender, select, FEMALE {ella} OTHER {aquesta persona} other {ell}}. | B25 | — |  |
| `admin-census:member.impersonate.description` | S'obrirà l'app tal com la veu l'abonat. Les accions quedaran auditades amb l'administrador que les faci. | B25 | — |  |
| `admin-census:member.impersonate.reason` | Motiu (opcional) | B25 | — |  |
| `admin-census:member.payment.iban` | IBAN nou | B25 | — | Auditoria |
| `admin-census:member.payment.ibanHelp` | El número complet queda ocult i no es torna a mostrar. | B25 | — |  |
| `admin-census:member.payment.title` | Mètode de pagament | B25 | — |  |
| `admin-census:member.privacy.consents.empty` | No hi ha consentiments registrats. | B25 | aprovat (A39.222) |  |
| `admin-census:member.privacy.consents.loading` | Carregant els consentiments… | B25 | aprovat (A39.221) |  |
| `admin-census:member.privacy.consents.title` | Historial de consentiments | B25 | aprovat (A39.167) |  |
| `admin-census:member.privacy.consents.withdrawn` | revocat | B25 | aprovat (A39.169) |  |
| `admin-census:member.privacy.erased` | suprimit | B25 | aprovat (A39.164) |  |
| `admin-census:member.privacy.erasure.action` | Suprimeix les dades (RGPD) | B25 | aprovat (A39.173) |  |
| `admin-census:member.privacy.erasure.blocked` | La supressió prevista per al {date} està bloquejada: es torna a provar cada dia. | B25 | aprovat (A39.230) |  |
| `admin-census:member.privacy.erasure.blockReasons.futureBookings` | Hi ha reserves futures actives. | B25 | aprovat (A39.186) |  |
| `admin-census:member.privacy.erasure.blockReasons.invoicesOpen` | Hi ha rebuts pendents, en cobrament o impagats. | B25 | aprovat (A39.184) |  |
| `admin-census:member.privacy.erasure.blockReasons.memberNotLeft` | L'abonat encara no està de baixa. | B25 | aprovat (A39.183) |  |
| `admin-census:member.privacy.erasure.blockReasons.other` | La supressió està bloquejada. | B25 | — |  |
| `admin-census:member.privacy.erasure.blockReasons.otherMembershipsActive` | El compte té una altra afiliació activa. | B25 | aprovat (A39.187) |  |
| `admin-census:member.privacy.erasure.blockReasons.upfrontOpen` | Hi ha pagaments inicials oberts. | B25 | aprovat (A39.185) |  |
| `admin-census:member.privacy.erasure.cancel` | Anul·la la supressió | B25 | aprovat (A39.177) |  |
| `admin-census:member.privacy.erasure.cancelConfirm` | ANUL·LA LA SUPRESSIÓ | B25 | aprovat (A39.233) |  |
| `admin-census:member.privacy.erasure.cancelDescription` | La sol·licitud es cancel·larà i les dades no se suprimiran en la data programada. | B25 | aprovat (A39.178) |  |
| `admin-census:member.privacy.erasure.cancelled` | La sol·licitud s'ha anul·lat. | B25 | aprovat (A39.234) |  |
| `admin-census:member.privacy.erasure.cancelling` | Anul·lant la supressió… | B25 | aprovat (A39.232) |  |
| `admin-census:member.privacy.erasure.checks.bookings` | No hi pot haver cap reserva futura activa. | B25 | aprovat (A39.182) |  |
| `admin-census:member.privacy.erasure.checks.invoices` | No hi pot haver cap rebut obert. | B25 | aprovat (A39.180) |  |
| `admin-census:member.privacy.erasure.checks.left` | L'abonat ha d'estar de baixa. | B25 | aprovat (A39.179) |  |
| `admin-census:member.privacy.erasure.checks.upfront` | No hi pot haver cap pagament inicial obert. | B25 | aprovat (A39.181) |  |
| `admin-census:member.privacy.erasure.confirm` | PROGRAMA LA SUPRESSIÓ | B25 | aprovat (A39.175) |  |
| `admin-census:member.privacy.erasure.description` | La supressió pseudonimitza les dades personals i conserva els moviments que s'han de retenir legalment. | B25 | aprovat (A39.174) |  |
| `admin-census:member.privacy.erasure.erasing` | La supressió està en curs. | B25 | aprovat (A39.231) |  |
| `admin-census:member.privacy.erasure.leaveFirst` | Per suprimir les dades, primer cal tramitar la baixa de l'abonat. | B25 | aprovat (A39.225) |  |
| `admin-census:member.privacy.erasure.loading` | Comprovant si hi ha una supressió programada… | B25 | aprovat (A39.226) |  |
| `admin-census:member.privacy.erasure.reason` | Motiu (opcional) | B25 | aprovat (A39.227) |  |
| `admin-census:member.privacy.erasure.requested` | La supressió s'ha programat. | B25 | aprovat (A39.229) |  |
| `admin-census:member.privacy.erasure.requesting` | Programant la supressió… | B25 | aprovat (A39.228) |  |
| `admin-census:member.privacy.erasure.scheduled` | Supressió programada per al {date} | B25 | aprovat (A39.176) |  |
| `admin-census:member.privacy.erasure.title` | Supressió de dades | B25 | aprovat (A39.172) |  |
| `admin-census:member.privacy.export` | Descarrega les dades (RGPD) | B25 | aprovat (A39.165) |  |
| `admin-census:member.privacy.exportPreparing` | S'està preparant el paquet de dades. | B25 | aprovat (A39.220) |  |
| `admin-census:member.privacy.exportRequested` | Paquet de dades sol·licitat. Consulta'n l'estat a Exportacions. | B25 | — |  |
| `admin-census:member.privacy.title` | Privacitat i dades | B25 | aprovat (A39.163) |  |
| `admin-census:member.resend.description` | S'enviarà un enllaç nou al correu d'accés del compte. | B25 | — |  |
| `admin-census:member.resend.title` | Reenvia l'accés | B25 | — |  |
| `admin-census:member.tabs.label` | Apartats de la fitxa | B25 | — |  |
| `admin-census:member.tabs.tasksPlaceholder` | La gestió completa de tasques s'incorpora amb el seguiment d'alumnes. | B25 | — |  |
| `admin-census:paymentMethod.copy` | Copia l'enllaç | B25 | — |  |
| `admin-census:paymentMethod.current` | Mètode actual | B25 | — |  |
| `admin-census:paymentMethod.invalidCard` | Targeta no vàlida | B25 | — |  |
| `admin-census:paymentMethod.providerMissing` | El club no té Stripe configurat. | B25 | — |  |
| `admin-census:paymentMethod.sendCardLink` | Envia l'enllaç per actualitzar la targeta | B25 | — |  |
| `admin-census:plan.current` | Modalitat actual | B25 | — |  |
| `admin-census:plan.effectiveMonth` | Mes d'efecte (opcional) | B25 | — |  |
| `admin-census:plan.newPlan` | Modalitat nova | B25 | — |  |
| `admin-census:plan.nextInvoiceDate` | Data del proper rebut (opcional) | B25 | — |  |
| `admin-census:plan.nextInvoiceDefault` | Si la deixes en blanc, el proper rebut serà el {date}. | B25 | — |  |
| `admin-census:plan.packDiscountRule` | En passar d'un pack de {minSessions} sessions o més a una quota mensual, l'entrada té un {discountPercent} % de descompte. L'import l'ha de calcular l'API. | B25 | — |  |
| `admin-census:reactivation.action` | Reactiva l'abonat | B25 | — |  |
| `admin-census:reactivation.description` | La reactivació no cobra entrada. Els gossos continuaran inactius fins que es reactivin un per un des de la seva fitxa. | B25 | — |  |
| `admin-census:reactivation.success` | L'abonat s'ha reactivat. | B25 | — |  |
| `admin-census:reactivation.title` | Reactiva l'abonat | B25 | — |  |
| `enums:upfrontConcept.SINGLE_CLASS` | Classe individual | B25 | — |  |
| `enums:upfrontStatus.CANCELLED` | anul·lat | B25 | — |  |
| `enums:upfrontStatus.CHECKOUT_PENDING` | pendent de pagament | B25 | — |  |
| `enums:upfrontStatus.PARTIAL` | parcial | B25 | — |  |
| `enums:upfrontStatus.REFUNDED` | reemborsat | B25 | — |  |

## D6 — facturació i remeses

| Clau | Text (ca) | Font | Registre | També a |
|---|---|---|---|---|
| `admin-billing:actions.chargeCards` | COBRA LES TARGETES | B25 | — |  |
| `admin-billing:actions.generateCards` | 2 · GENERA ELS REBUTS I COBRA LES TARGETES | B25 | — |  |
| `admin-billing:actions.generateNeedsSimulation` | Primer cal simular el mes. | B25 | — |  |
| `admin-billing:actions.generateOnly` | 2 · GENERA ELS REBUTS | B25 | — |  |
| `admin-billing:actions.generateRunExists` | Els rebuts d'aquest mes ja s'han generat. | B25 | — |  |
| `admin-billing:actions.manualInvoice` | Rebut manual | B25 | — |  |
| `admin-billing:actions.simulating` | Simulant el mes… | B25 | — |  |
| `admin-billing:confirm.chargeBody` | Es cobraran {count} rebuts amb targeta per un total de {total}. | B25 | — |  |
| `admin-billing:confirm.chargeTitle` | Cobra les targetes | B25 | — |  |
| `admin-billing:confirm.charging` | Enviant els cobraments… | B25 | — |  |
| `admin-billing:confirm.generateBody` | Es generaran {count} rebuts per un total de {total}. La data del proper rebut dels abonats avançarà al dia {nextDate}. | B25 | — |  |
| `admin-billing:confirm.generateTitle` | Genera els rebuts · {month} | B25 | — |  |
| `admin-billing:confirm.generateWithEarliest` | Genera amb cobrament el {date} | B25 | — |  |
| `admin-billing:confirm.generating` | Generant els rebuts… | B25 | — |  |
| `admin-billing:confirm.markingPaid` | Marcant cobrat… | B25 | — |  |
| `admin-billing:confirm.markPaidBody` | {count, plural, one {Es marcarà # rebut com a cobrat.} other {Es marcaran # rebuts com a cobrats.}} | B25 | — |  |
| `admin-billing:confirm.reference` | Referència (opcional) | B25 | — |  |
| `admin-billing:confirm.rollbackDates` | la data del proper rebut dels abonats tornarà a ser l'anterior; | B25 | — |  |
| `admin-billing:confirm.rollbackFileNotSent` | Només si el fitxer no s'ha enviat mai al banc | B25 | — |  |
| `admin-billing:confirm.rollbackIntro` | Es desfarà la generació del mes: | B25 | — |  |
| `admin-billing:confirm.rollbackInvoices` | {count, plural, one {s'anul·larà # rebut;} other {s'anul·laran # rebuts;}} | B25 | — |  |
| `admin-billing:confirm.rollbackKeywordLabel` | Escriu {keyword} per confirmar-ho | B25 | — |  |
| `admin-billing:confirm.rollbackNumbering` | la numeració dels rebuts tornarà enrere; | B25 | — |  |
| `admin-billing:confirm.rollbackRemittance` | la remesa quedarà retrocedida (el fitxer XML es conserva). | B25 | — |  |
| `admin-billing:confirm.rollingBack` | Retrocedint la remesa… | B25 | — |  |
| `admin-billing:confirm.submissionBody` | La remesa quedarà marcada com a enviada al banc. A partir d'aquí ja no es podrà retrocedir. | B25 | — |  |
| `admin-billing:confirm.submissionTitle` | Marca com a enviada al banc · {month} | B25 | — |  |
| `admin-billing:confirm.submit` | Marca com a enviada | B25 | — |  |
| `admin-billing:confirm.submittedAt` | Data d'enviament al banc | B25 | — |  |
| `admin-billing:confirm.submitting` | Desant… | B25 | — |  |
| `admin-billing:drawer.actions` | Accions del rebut | B25 | — |  |
| `admin-billing:drawer.base` | Base | B25 | — |  |
| `admin-billing:drawer.cancel` | Anul·la el rebut | B25 | — |  |
| `admin-billing:drawer.cancelBody` | El rebut {number} quedarà anul·lat. Les correccions es fan amb un rebut nou. | B25 | — |  |
| `admin-billing:drawer.cancelledAt` | Anul·lat el | B25 | — |  |
| `admin-billing:drawer.cancelReasonRollback` | retrocés de la remesa | B25 | — |  |
| `admin-billing:drawer.cancelTitle` | Anul·la el rebut | B25 | — |  |
| `admin-billing:drawer.close` | Tanca el rebut | B25 | — |  |
| `admin-billing:drawer.collectionLine` | {provider} · intent {attempt} · {status} | B25 | — |  |
| `admin-billing:drawer.document` | Descarrega el justificant | B25 | — |  |
| `admin-billing:drawer.documentLoading` | Obrint el justificant… | B25 | — |  |
| `admin-billing:drawer.done.cancelled` | Rebut anul·lat. | B25 | — |  |
| `admin-billing:drawer.done.failed` | Rebut marcat com a impagat. | B25 | — |  |
| `admin-billing:drawer.done.paid` | Rebut marcat com a cobrat. | B25 | — |  |
| `admin-billing:drawer.done.refunded` | S'ha demanat el reemborsament. | B25 | — |  |
| `admin-billing:drawer.done.retried` | S'ha tornat a enviar el cobrament amb targeta. | B25 | — |  |
| `admin-billing:drawer.failAt` | Data de l'impagat | B25 | — |  |
| `admin-billing:drawer.failedAt` | Impagat el | B25 | — |  |
| `admin-billing:drawer.failTitle` | Marca impagat | B25 | — |  |
| `admin-billing:drawer.includeInNextRun` | amb la propera remesa | B25 | — |  |
| `admin-billing:drawer.issueDate` | Data d'emissió | B25 | — |  |
| `admin-billing:drawer.loadError` | No s'ha pogut carregar el rebut. | B25 | — |  |
| `admin-billing:drawer.loading` | Carregant el rebut… | B25 | — |  |
| `admin-billing:drawer.markFailed` | Marca impagat | B25 | — |  |
| `admin-billing:drawer.noCollections` | Encara no hi ha cap cobrament. | B25 | — |  |
| `admin-billing:drawer.paidAt` | Cobrat el | B25 | — |  |
| `admin-billing:drawer.paymentMethod` | Mètode de pagament | B25 | — |  |
| `admin-billing:drawer.refund` | Reemborsa | B25 | — |  |
| `admin-billing:drawer.refundAmount` | Import a reemborsar | B25 | — |  |
| `admin-billing:drawer.refundAmountHelp` | En blanc, es reemborsa tot el que queda. | B25 | — |  |
| `admin-billing:drawer.refundAmountInvalid` | Escriu un import positiu. | B25 | — |  |
| `admin-billing:drawer.refundedTotal` | Reemborsat | B25 | — |  |
| `admin-billing:drawer.refundLine` | Reemborsament de {amount} el {date}: {reason} | B25 | — |  |
| `admin-billing:drawer.refundTitle` | Reemborsa | B25 | — |  |
| `admin-billing:drawer.retry` | Reintenta amb targeta | B25 | — |  |
| `admin-billing:drawer.retryBody` | Es tornaran a cobrar {total} a la targeta ···· {last4}. | B25 | — |  |
| `admin-billing:drawer.retryTitle` | Reintenta amb targeta | B25 | — |  |
| `admin-billing:drawer.saving` | Desant… | B25 | — |  |
| `admin-billing:drawer.tax` | Impost | B25 | — |  |
| `admin-billing:drawer.taxPercent` | % impost | B25 | — |  |
| `admin-billing:empty.noSimulation` | Encara no hi ha cap simulació d'aquest mes | B25 | — |  |
| `admin-billing:empty.noSimulationHelp` | Simula el mes per veure les incidències i els rebuts que es generaran. | B25 | — |  |
| `admin-billing:errors.billingBusy` | Hi ha una generació en curs. Torna-ho a provar d'aquí a uns minuts. | B25 | — |  |
| `admin-billing:errors.chargingSlow` | Els cobraments amb targeta encara s'estan processant. | B25 | — |  |
| `admin-billing:errors.collectionDateTooSoon` | La data de cobrament {requested} és massa propera: la primera possible és {earliest}. | B25 | — |  |
| `admin-billing:errors.dateAfterToday` | La data no pot ser posterior a avui. | B25 | — |  |
| `admin-billing:errors.generic` | No s'ha pogut completar l'operació. | B25 | — |  |
| `admin-billing:errors.loadPeriod` | No s'ha pogut carregar el mes. | B25 | — |  |
| `admin-billing:errors.loadRun` | No s'ha pogut actualitzar l'estat dels cobraments. | B25 | — |  |
| `admin-billing:errors.maxAttempts` | Ja s'han fet {attempts} dels {max} intents de cobrament. | B25 | — |  |
| `admin-billing:errors.notRollbackable` | No es pot retrocedir la remesa: | B25 | — |  |
| `admin-billing:errors.openSettings` | Obre Paràmetres | B25 | — |  |
| `admin-billing:errors.periodTooFar` | Només es pot simular fins a tres mesos endavant. | B25 | — |  |
| `admin-billing:errors.priceOverlap` | La modalitat {plan} té dos preus vigents per a {concept}. Corregeix-ho a Modalitats i tarifes. | B25 | — |  |
| `admin-billing:errors.sepaNotConfigured` | La remesa SEPA no està configurada. | B25 | — |  |
| `admin-billing:errors.simulateAgain` | Simula de nou | B25 | — |  |
| `admin-billing:errors.simulationStale` | Hi ha hagut canvis des de l'última simulació. Torna a simular el mes. | B25 | — |  |
| `admin-billing:errors.staleInvoice` | El rebut ha canviat. Torna a obrir-lo. | B25 | — |  |
| `admin-billing:errors.submittedAtRange` | La data ha de ser entre el {earliest} i avui. | B25 | — |  |
| `admin-billing:errors.trace` | Referència de l'error: {traceId} | B25 | — |  |
| `admin-billing:export.csv` | CSV | B25 | — |  |
| `admin-billing:export.footnote` | Una fila per línia de rebut; format CSV amb separador «;». | B25 | — |  |
| `admin-billing:export.running` | Exportant… | B25 | — |  |
| `admin-billing:export.xlsx` | Excel (XLSX) | B25 | — |  |
| `admin-billing:header.allMonths` | Tots els mesos | B25 | — |  |
| `admin-billing:header.months` | Canvi de mes | B25 | — |  |
| `admin-billing:header.remittances` | Remeses › | B25 | — |  |
| `admin-billing:kpi.card` | Amb targeta | B25 | — |  |
| `admin-billing:kpi.collectionDatePassed` | Ja ha passat la data de cobrament: marca la remesa com a enviada o espera la resposta del banc | B25 | — |  |
| `admin-billing:kpi.submitBefore` | Presenta-la al banc abans del {date} | B25 | — |  |
| `admin-billing:list.chips` | Estat dels rebuts | B25 | — |  |
| `admin-billing:list.columns.issueDate` | Data d'emissió | B25 | — |  |
| `admin-billing:list.emptyDescription` | No hi ha cap rebut d'aquest mes amb aquests filtres. | B25 | — |  |
| `admin-billing:list.emptyTitle` | Cap rebut | B25 | — |  |
| `admin-billing:list.filters.issueDate` | Data d'emissió | B25 | — |  |
| `admin-billing:list.loadError` | No s'han pogut carregar els rebuts. | B25 | — |  |
| `admin-billing:list.loading` | Carregant la facturació… | B25 | — |  |
| `admin-billing:list.openInvoice` | Obre el rebut {number} | B25 | — |  |
| `admin-billing:list.remittanceLink` | Remeses › | B25 | — |  |
| `admin-billing:list.search` | Cerca per número o abonat | B25 | — |  |
| `admin-billing:list.selectInvoice` | Selecciona el rebut {number} | B25 | — |  |
| `admin-billing:manual.addLine` | Afegeix una línia | B25 | — |  |
| `admin-billing:manual.amount` | Import (línia {index}) | B25 | — |  |
| `admin-billing:manual.amountRequired` | Escriu un import diferent de zero. | B25 | — |  |
| `admin-billing:manual.create` | Crea el rebut | B25 | — |  |
| `admin-billing:manual.created` | Rebut {number} creat. | B25 | — |  |
| `admin-billing:manual.creating` | Creant el rebut… | B25 | — |  |
| `admin-billing:manual.description` | Concepte (línia {index}) | B25 | — |  |
| `admin-billing:manual.descriptionRequired` | Escriu el concepte. | B25 | — |  |
| `admin-billing:manual.includeInNextRun` | Cobra'l amb la propera remesa | B25 | — |  |
| `admin-billing:manual.memberRequired` | Tria un abonat. | B25 | — |  |
| `admin-billing:manual.memberSearch` | Cerca per nom o número | B25 | — |  |
| `admin-billing:manual.memberSearching` | Cercant… | B25 | — |  |
| `admin-billing:manual.noMembers` | Cap abonat coincideix amb la cerca. | B25 | — |  |
| `admin-billing:manual.period` | Mes del rebut | B25 | — |  |
| `admin-billing:manual.periodRange` | Tria un mes entre {from} i {to}. | B25 | — |  |
| `admin-billing:manual.removeLine` | Treu la línia {index} | B25 | — |  |
| `admin-billing:manual.taxInvalid` | Escriu un percentatge entre 0 i 100. | B25 | — |  |
| `admin-billing:manual.taxPercent` | % impost (línia {index}) | B25 | — |  |
| `admin-billing:manual.title` | Rebut manual | B25 | — |  |
| `admin-billing:remittances.back` | ‹ Facturació | B25 | — |  |
| `admin-billing:remittances.caption` | Remeses SEPA | B25 | — |  |
| `admin-billing:remittances.close` | Tanca la remesa | B25 | — |  |
| `admin-billing:remittances.columns.creationAt` | Data de creació | B25 | — |  |
| `admin-billing:remittances.columns.submittedAt` | Enviada al banc | B25 | — |  |
| `admin-billing:remittances.creditorBic` | BIC | B25 | — |  |
| `admin-billing:remittances.creditorIban` | Compte del creditor | B25 | — |  |
| `admin-billing:remittances.creditorId` | Identificador de creditor | B25 | — |  |
| `admin-billing:remittances.download` | Descarrega l'XML | B25 | — |  |
| `admin-billing:remittances.downloading` | Descarregant… | B25 | — |  |
| `admin-billing:remittances.emptyDescription` | Encara no s'ha generat cap remesa. | B25 | — |  |
| `admin-billing:remittances.emptyTitle` | Cap remesa | B25 | — |  |
| `admin-billing:remittances.loadError` | No s'han pogut carregar les remeses. | B25 | — |  |
| `admin-billing:remittances.loading` | Carregant la remesa… | B25 | — |  |
| `admin-billing:remittances.loadOneError` | No s'ha pogut carregar la remesa. | B25 | — |  |
| `admin-billing:remittances.markSubmitted` | Marca com a enviada al banc | B25 | — |  |
| `admin-billing:remittances.messageId` | Identificador del missatge | B25 | — |  |
| `admin-billing:remittances.open` | Obre la remesa: {month} | B25 | — |  |
| `admin-billing:remittances.sequence` | Seqüències | B25 | — |  |
| `admin-billing:remittances.sequenceValue` | FRST {first} · RCUR {recurrent} | B25 | — |  |
| `admin-billing:remittances.submitted` | Remesa marcada com a enviada al banc. | B25 | — |  |
| `admin-billing:remittances.title` | Remeses | B25 | — |  |
| `admin-billing:remittances.xsd` | Validació XSD | B25 | — |  |
| `admin-billing:remittances.xsdNotValidated` | Sense validar | B25 | — |  |
| `admin-billing:simulation.incidentsCount` | {count, plural, one {# incidència} other {# incidències}} | B25 | — |  |
| `admin-billing:simulation.incidentsFootnote` | Els abonats amb incidència s'ometen de la generació. | B25 | — |  |
| `admin-billing:simulation.noIncidents` | Cap incidència | B25 | — |  |
| `admin-billing:simulation.openRecordOf` | Obre fitxa de {name} | B25 | — |  |
| `admin-billing:simulation.skippedTitle` | Omesos de la generació | B25 | — |  |
| `admin-billing:status.charging` | cobrant | B25 | — |  |
| `admin-billing:status.failedCard` | impagat (targeta) | B25 | — |  |
| `admin-billing:status.rolledBack` | anul·lat · retrocés | B25 | — |  |
| `admin-billing:toasts.chargesSkipped` | {count, plural, one {# rebut omès} other {# rebuts omesos}}: {reasons} | B25 | — |  |
| `admin-billing:toasts.chargesSubmitted` | {count, plural, one {# cobrament enviat} other {# cobraments enviats}} | B25 | — |  |
| `admin-billing:toasts.charging` | Cobrant les targetes… | B25 | — |  |
| `admin-billing:toasts.dismiss` | Tanca l'avís | B25 | — |  |
| `admin-billing:toasts.generated` | {count, plural, one {# rebut generat} other {# rebuts generats}} | B25 | — |  |
| `admin-billing:toasts.markedPaid` | {count, plural, one {# rebut marcat com a cobrat} other {# rebuts marcats com a cobrats}} | B25 | — |  |
| `admin-billing:toasts.rolledBack` | {count, plural, one {# rebut anul·lat} other {# rebuts anul·lats}} | B25 | — |  |
| `enums:billingIncident.CARD_INVALID` | targeta no vàlida | B25 | — |  |
| `enums:billingIncident.CURRENCY_MISMATCH` | moneda diferent de la del club | B25 | — |  |
| `enums:billingIncident.MANDATE_PENDING` | mandat SEPA pendent | B25 | — |  |
| `enums:billingIncident.MEMBER_NOT_ACTIVE` | abonat no actiu | B25 | — |  |
| `enums:billingIncident.NO_NEXT_INVOICE_DATE` | sense data del proper rebut | B25 | — |  |
| `enums:billingIncident.NO_PAYMENT_METHOD` | sense mètode de pagament | B25 | — |  |
| `enums:billingIncident.NO_PLAN` | sense modalitat assignada | B25 | — |  |
| `enums:billingIncident.PAYMENT_METHOD_CHANGED` | mètode de pagament canviat | B25 | — |  |
| `enums:billingIncident.PROVIDER_DISABLED` | proveïdor de pagament desactivat | B25 | — |  |
| `enums:collectionFailure.BANK_RETURN` | devolució bancària | B25 | — |  |
| `enums:collectionFailure.card_declined` | targeta rebutjada | B25 | — |  |
| `enums:collectionFailure.expired_card` | targeta caducada | B25 | — |  |
| `enums:collectionFailure.insufficient_funds` | fons insuficients | B25 | — |  |
| `enums:collectionFailure.NO_PAYMENT_METHOD` | sense targeta vàlida | B25 | — |  |
| `enums:collectionFailure.ROLLBACK` | retrocés de la remesa | B25 | — |  |
| `enums:collectionStatus.CREATED` | creat | B25 | — |  |
| `enums:collectionStatus.FAILED` | fallit | B25 | — |  |
| `enums:collectionStatus.REFUNDED` | reemborsat | B25 | — |  |
| `enums:collectionStatus.SUBMITTED` | enviat | B25 | — |  |
| `enums:invoiceKind.MIGRATED` | Migrat | B25 | — |  |
| `enums:invoiceLineOrigin.MIGRATED` | Migrat | B25 | — |  |
| `enums:invoiceLineOrigin.SINGLE_CLASS` | Classe individual | B25 | — |  |
| `enums:invoiceStatus.CANCELLED` | anul·lat | B25 | — |  |
| `enums:remittanceStatus.ROLLED_BACK` | retrocedida | B25 | — |  |
| `enums:remittanceStatus.SUBMITTED` | enviada al banc | B25 | — |  |
| `enums:rollbackBlocker.COLLECTION_DATE_PASSED` | la data de cobrament ja ha arribat | B25 | — |  |
| `enums:rollbackBlocker.COLLECTION_SUBMITTED` | hi ha cobraments enviats | B25 | — |  |
| `enums:rollbackBlocker.INVOICE_PAID` | hi ha rebuts cobrats | B25 | — |  |
| `enums:rollbackBlocker.MANUAL_INVOICE_AFTER` | s'ha emès un rebut manual després de la generació | B25 | — |  |
| `enums:rollbackBlocker.REMITTANCE_SUBMITTED` | la remesa ja s'ha enviat al banc | B25 | — |  |

## D7 — activitats

| Clau | Text (ca) | Font | Registre | També a |
|---|---|---|---|---|
| `admin-activities:cancelModal.confirm` | {count, plural, one {CANCEL·LA I AVISA L'INSCRIT} other {CANCEL·LA I AVISA ELS # INSCRITS}} | B25 | — |  |
| `admin-activities:cancelModal.deleteTitle` | Vols eliminar l'activitat? | B25 | — |  |
| `admin-activities:cancelModal.intro` | Aquesta activitat té {count, plural, one {# inscrit} other {# inscrits}}. Si la cancel·les, rebran un avís a l'app, per correu i per SMS amb el text que escriguis a sota. | B25 | — |  |
| `admin-activities:cancelModal.simpleConfirm` | CANCEL·LA L'ACTIVITAT | B25 | — |  |
| `admin-activities:cancelModal.simpleTitle` | Vols cancel·lar l'activitat? | B25 | — |  |
| `admin-activities:cancelModal.title` | Cancel·lar l'activitat — {title} | B25 | — |  |
| `admin-activities:common.error` | No s'ha pogut completar l'acció. Torna-ho a provar. | B25 | — |  |
| `admin-activities:common.loading` | Carregant l'activitat | B25 | — |  |
| `admin-activities:common.saving` | Desant | B25 | — |  |
| `admin-activities:create.submit` | Crea l'activitat | B25 | — |  |
| `admin-activities:create.titleRequired` | Escriu el títol en {locale}. | B25 | — |  |
| `admin-activities:form.addDocument` | Afegeix el document | B25 | — |  |
| `admin-activities:form.addImage` | Afegeix una imatge | B25 | — |  |
| `admin-activities:form.cancelActivity` | CANCEL·LA L'ACTIVITAT | B25 | — |  |
| `admin-activities:form.cancelled` | Activitat cancel·lada | B25 | — |  |
| `admin-activities:form.chooseDocument` | Tria un document | B25 | — |  |
| `admin-activities:form.closedDay` | El club està tancat aquest dia | B25 | — |  |
| `admin-activities:form.datePlaceholder` | dd/mm/aaaa | B25 | — |  |
| `admin-activities:form.documentName` | Nom del document | B25 | — |  |
| `admin-activities:form.documentUploaded` | Document afegit | B25 | — |  |
| `admin-activities:form.editor.bold` | Negreta | B25 | — |  |
| `admin-activities:form.editor.h3` | Títol de secció | B25 | — |  |
| `admin-activities:form.editor.h4` | Subtítol | B25 | — |  |
| `admin-activities:form.editor.italic` | Cursiva | B25 | — |  |
| `admin-activities:form.editor.linkApply` | Afegeix l'enllaç | B25 | — |  |
| `admin-activities:form.editor.linkInvalid` | Només s'admeten enllaços https://, http:// o mailto:. | B25 | — |  |
| `admin-activities:form.editor.linkUrl` | Adreça de l'enllaç (https:// o mailto:) | B25 | — |  |
| `admin-activities:form.editor.orderedList` | Llista numerada | B25 | — |  |
| `admin-activities:form.editor.toolbar` | Format del text | B25 | — |  |
| `admin-activities:form.editor.unorderedList` | Llista de punts | B25 | — |  |
| `admin-activities:form.endTime` | Hora de final | B25 | — |  |
| `admin-activities:form.fileTooLarge` | El fitxer supera els {max} MB. | B25 | — |  |
| `admin-activities:form.holiday` | dia festiu | B25 | — |  |
| `admin-activities:form.imageUploaded` | Imatge desada | B25 | — |  |
| `admin-activities:form.invalidDate` | Escriu la data com dd/mm/aaaa. | B25 | — |  |
| `admin-activities:form.levelsLabel` | Nivells admesos | B25 | — |  |
| `admin-activities:form.noImage` | Sense imatge | B25 | — |  |
| `admin-activities:form.placesHelp` | Buit = sense màxim | B25 | — |  |
| `admin-activities:form.placesInvalid` | Escriu un nombre de places a partir d'1. | B25 | — |  |
| `admin-activities:form.published` | Activitat publicada | B25 | — |  |
| `admin-activities:form.registrationTo` | Inscripció: al | B25 | — |  |
| `admin-activities:form.removeImage` | Treu la imatge | B25 | — |  |
| `admin-activities:form.replaceImage` | Canvia la imatge | B25 | — |  |
| `admin-activities:form.requiredToPublish` | Cal per publicar | B25 | — |  |
| `admin-activities:form.ringsOffSite` | Fora del club no es bloqueja cap pista | B25 | — |  |
| `admin-activities:form.saved` | Canvis desats | B25 | — |  |
| `admin-activities:form.slug` | Identificador de l'adreça | B25 | — |  |
| `admin-activities:form.stale` | Algú altre ha modificat l'activitat: s'han carregat les dades actuals. Revisa-les i torna a desar. | B25 | — |  |
| `admin-activities:form.typeLabel` | Etiqueta pròpia | B25 | — |  |
| `admin-activities:form.unpublish` | DESPUBLICA | B25 | — |  |
| `admin-activities:form.unpublished` | Activitat despublicada | B25 | — |  |
| `admin-activities:list.caption` | Llistat d'activitats | B25 | — |  |
| `admin-activities:list.columns.registrationTo` | Inscripció fins | B25 | — |  |
| `admin-activities:list.columns.slug` | Identificador de l'adreça | B25 | — |  |
| `admin-activities:list.emptyDescription` | Crea la primera activitat del club. | B25 | — |  |
| `admin-activities:list.emptyFilteredDescription` | Canvieu la cerca o els filtres per veure més resultats. | B25 | — |  |
| `admin-activities:list.emptyFilteredTitle` | Cap activitat amb aquests criteris | B25 | — |  |
| `admin-activities:list.emptyTitle` | Encara no hi ha cap activitat | B25 | — |  |
| `admin-activities:list.error` | No s'han pogut carregar les activitats. | B25 | — |  |
| `admin-activities:list.filters.registrationOpen` | Inscripció oberta | B25 | — |  |
| `admin-activities:list.search` | Cerca una activitat | B25 | — |  |
| `admin-activities:list.statuses.withoutDeleted` | Sense les eliminades | B25 | — |  |
| `admin-activities:placements.addTitle` | Afegeix una col·locació | B25 | — |  |
| `admin-activities:placements.course` | Recorregut | B25 | — |  |
| `admin-activities:placements.empty` | Aquesta activitat encara no té cap recorregut col·locat. | B25 | — |  |
| `admin-activities:placements.error` | No s'han pogut carregar les col·locacions. | B25 | — |  |
| `admin-activities:placements.loading` | Carregant les col·locacions | B25 | — |  |
| `admin-activities:placements.noCourses` | El club encara no té cap recorregut a la biblioteca. | B25 | — |  |
| `admin-activities:placements.place` | Col·loca'l | B25 | — |  |
| `admin-activities:placements.sheet` | Full de muntatge | B25 | — |  |
| `admin-activities:placements.sheetFallback` | recorregut | B25 | — |  |
| `admin-activities:placements.sheetFile` | full-de-muntatge-{course}.pdf | B25 | — |  |
| `admin-activities:placements.sheetPending` | Descarregant el full de muntatge | B25 | — |  |
| `admin-activities:placements.sheetStale` | La geometria de la pista ha canviat: revisa la col·locació abans de treure'n el full de muntatge. | B25 | — |  |
| `admin-activities:placements.title` | Col·locacions | B25 | — |  |
| `admin-activities:publishDialog.apply` | PUBLICA I APLICA | B25 | — |  |
| `admin-activities:publishDialog.applySave` | DESA I APLICA | B25 | — |  |
| `admin-activities:publishDialog.cancelBookings` | Cancel·la les reserves d'entrenament | B25 | — |  |
| `admin-activities:publishDialog.cancelClasses` | Anul·la les classes en conflicte i avisa els inscrits | B25 | — |  |
| `admin-activities:publishDialog.classesLabel` | Classes i bloquejos en conflicte | B25 | — |  |
| `admin-activities:publishDialog.confirmText` | Vols publicar l'activitat? Els abonats admesos rebran un avís. | B25 | — |  |
| `admin-activities:publishDialog.confirmTitle` | Publicar l'activitat | B25 | — |  |
| `admin-activities:publishDialog.conflictsTitle` | Conflictes de pista | B25 | — |  |
| `admin-activities:publishDialog.incomplete` | Falten dades per publicar l'activitat: revisa els camps marcats. | B25 | — |  |
| `admin-activities:publishDialog.notifyEmail` | Avisa també per correu | B25 | — |  |
| `admin-activities:publishDialog.ringBlock` | bloqueig de pista | B25 | — |  |
| `admin-activities:publishDialog.ringBlockNotForceable` | Un bloqueig de pista no es pot anul·lar des d'aquí: canvia les pistes o l'horari de l'activitat. | B25 | — |  |
| `admin-activities:registrants.back` | Torna a l'activitat | B25 | — |  |
| `admin-activities:registrants.caption` | Inscrits de l'activitat | B25 | — |  |
| `admin-activities:registrants.columns.origin` | Origen | B25 | — |  |
| `admin-activities:registrants.columns.registeredAt` | Data d'inscripció | B25 | — |  |
| `admin-activities:registrants.emptyDescription` | Les inscripcions es fan des de l'app. | B25 | — |  |
| `admin-activities:registrants.emptyTitle` | Encara no hi ha cap inscrit | B25 | — |  |
| `admin-activities:registrants.error` | No s'han pogut carregar els inscrits. | B25 | — |  |
| `admin-activities:registrants.filters.origin` | Origen | B25 | — |  |
| `admin-activities:registrants.filters.registeredAt` | Data d'inscripció | B25 | — |  |
| `admin-activities:registrants.search` | Cerca un abonat | B25 | — |  |
| `admin-activities:registrants.waitlisted` | en llista d'espera ({position}) | B25 | — |  |
| `enums:activityState.FINISHED` | finalitzada | B25 | — |  |
| `enums:activityType.COURSE` | curset | B25 | — |  |

## D8 — modalitats i tarifes

| Clau | Text (ca) | Font | Registre | També a |
|---|---|---|---|---|
| `admin-catalogs:plans.addPrice` | Afegeix el preu | B25 | — |  |
| `admin-catalogs:plans.cancelPolicy.credit` | Crèdit | B25 | — |  |
| `admin-catalogs:plans.cancelPolicy.none` | Sense retorn | B25 | — |  |
| `admin-catalogs:plans.cancelPolicy.refund` | Devolució | B25 | — |  |
| `admin-catalogs:plans.chargeMode.attendance` | Càrrec en assistir | B25 | — |  |
| `admin-catalogs:plans.chargeMode.booking` | Pagament en reservar | B25 | — |  |
| `admin-catalogs:plans.empty` | Encara no hi ha cap modalitat | B25 | — |  |
| `admin-catalogs:plans.emptyPrices` | Encara no hi ha cap tarifa | B25 | — |  |
| `admin-catalogs:plans.entryMode.percent` | % de l'estàndard | B25 | — |  |
| `admin-catalogs:plans.fields.billingMode` | Mode de facturació | B25 | — |  |
| `admin-catalogs:plans.fields.cancelPolicy` | Política d'anul·lació | B25 | — |  |
| `admin-catalogs:plans.fields.chargeMode` | Mode de càrrec | B25 | — |  |
| `admin-catalogs:plans.fields.description` | Text de presentació | B25 | — |  |
| `admin-catalogs:plans.fields.dogsIncluded` | Gossos inclosos | B25 | — |  |
| `admin-catalogs:plans.fields.entryAmount` | Import de l'entrada | B25 | — |  |
| `admin-catalogs:plans.fields.entryPercent` | % de l'estàndard | B25 | — |  |
| `admin-catalogs:plans.fields.showOnSignup` | Mostra a l'alta | B25 | — |  |
| `admin-catalogs:plans.fields.showOnWeb` | Mostra al web | B25 | — |  |
| `admin-catalogs:plans.fields.taxPercent` | Impost (%) | B25 | — |  |
| `admin-catalogs:plans.newPrice` | Nou preu | B25 | — |  |
| `admin-catalogs:plans.priceLocked` | No es pot afegir: la data correspon a un període de preu bloquejat. | B25 | — |  |
| `admin-catalogs:plans.priceStatus.expired` | caducada | B25 | — |  |
| `admin-catalogs:plans.priceStatus.scheduled` | programada | B25 | — |  |
| `admin-catalogs:plans.singleClassPrice` | {amount}/classe | B25 | — |  |
| `admin-catalogs:plans.textsSaved` | Textos desats | B25 | — |  |
| `admin-catalogs:plans.types.singleClass` | classe individual | B25 | — |  |
| `admin-catalogs:plans.validityNote` | Les tarifes tenen vigència: canviar un preu no altera els rebuts ja emesos. Els packs caduquen per mesos de vigència i generen la baixa prevista automàtica. | B25 | — |  |

## D16 — pistes

| Clau | Text (ca) | Font | Registre | També a |
|---|---|---|---|---|
| `admin-catalogs:rings.caption` | Pistes del club | B25 | — |  |
| `admin-catalogs:rings.editTitle` | Edita la pista {name} | B25 | — |  |
| `admin-catalogs:rings.empty` | Encara no hi ha cap pista | B25 | — |  |
| `admin-catalogs:rings.fields.capacityHelp` | En blanc, s'aplica el valor general dels entrenaments. | B25 | — |  |
| `admin-catalogs:rings.geometry` | Geometria del ring | B25 | — |  |
| `admin-catalogs:rings.inUse` | Aquesta pista té classes o reserves: només es pot desactivar | B25 | — |  |
| `admin-catalogs:rings.removeQuestion` | Eliminar la pista {name}? | B25 | — |  |
| `admin-catalogs:rings.removeTitle` | Elimina la pista | B25 | — |  |
| `admin-catalogs:rings.ringBookings.deactivate` | Anul·la les reserves i desactiva la pista | B25 | — |  |
| `admin-catalogs:rings.ringBookings.text` | Si continues, aquestes reserves quedaran anul·lades pel club i se'n farà l'avís: | B25 | — |  |
| `admin-catalogs:rings.ringBookings.title` | Aquesta pista té reserves d'entrenament | B25 | — |  |
| `admin-catalogs:rings.ringBookings.unreservable` | Anul·la les reserves i desa | B25 | — |  |

## D17 — instructors i administradors

| Clau | Text (ca) | Font | Registre | També a |
|---|---|---|---|---|
| `admin-catalogs:team.administratorCaption` | Administradors del club | B25 | — |  |
| `admin-catalogs:team.editAdministratorTitle` | Edita l'administrador | B25 | — |  |
| `admin-catalogs:team.editInstructorTitle` | Edita l'instructor | B25 | — |  |
| `admin-catalogs:team.emptyAdministrators` | Encara no hi ha cap administrador | B25 | — |  |
| `admin-catalogs:team.emptyInstructors` | Encara no hi ha cap instructor | B25 | — |  |
| `admin-catalogs:team.fields.memberHelp` | Cerca un abonat en alta amb compte. | B25 | — |  |
| `admin-catalogs:team.instructorCaption` | Instructors del club | B25 | — |  |
| `admin-catalogs:team.instructorInUse` | Té {count} classes futures assignades: reassigna-les al calendari abans de desactivar-lo | B25 | — |  |
| `admin-catalogs:team.removeTitle` | Elimina el membre de l'equip | B25 | — |  |

## D11 — paràmetres del club

| Clau | Text (ca) | Font | Registre | També a |
|---|---|---|---|---|
| `admin-catalogs:common.drag` | Arrossega per reordenar | B25 | — |  |
| `admin-catalogs:common.genericError` | No s'ha pogut completar l'acció. | B25 | — |  |
| `admin-catalogs:common.loadError` | No s'han pogut carregar les dades. | B25 | — |  |
| `admin-catalogs:common.loading` | Carregant | B25 | — |  |
| `admin-catalogs:common.stale` | Algú ha modificat aquest registre; torna a carregar | B25 | — |  |
| `admin-catalogs:faq.editTitle` | Edita la pregunta | B25 | — |  |
| `admin-catalogs:faq.empty` | Encara no hi ha cap pregunta | B25 | — |  |
| `admin-catalogs:faq.removeQuestion` | Eliminar la pregunta «{question}»? | B25 | — |  |
| `admin-catalogs:faq.removeTitle` | Elimina la pregunta | B25 | — |  |
| `admin-catalogs:levels.caption` | Nivells del club | B25 | — |  |
| `admin-catalogs:levels.columns.progression` | Progressió | B25 | — |  |
| `admin-catalogs:levels.editTitle` | Edita el nivell | B25 | — |  |
| `admin-catalogs:levels.empty` | Encara no hi ha cap nivell | B25 | — |  |
| `admin-catalogs:levels.fields.freeTraining` | Dona dret a entrenament lliure | B25 | — |  |
| `admin-catalogs:levels.fields.progression` | Progressió | B25 | — |  |
| `admin-catalogs:levels.inUse` | Aquest nivell té dades relacionades: només es pot desactivar | B25 | — |  |
| `admin-catalogs:levels.progressionHelp` | Els nivells fora de la progressió no compten per a les descripcions «… i sup.». | B25 | — |  |
| `admin-catalogs:levels.progressionSwitch` | Progressió: {name} | B25 | — |  |
| `admin-catalogs:levels.removeQuestion` | Eliminar el nivell {name}? | B25 | — |  |
| `admin-catalogs:levels.removeTitle` | Elimina el nivell | B25 | — |  |
| `admin-catalogs:team.lastAdmin` | Hi ha d'haver almenys un administrador actiu | B25 | — |  |
| `admin-settings:blocks.clubPages` | Pàgines del club | B25 | — |  |
| `admin-settings:blocks.courses` | Recorreguts | B25 | — | D19 — consola de clubs |
| `admin-settings:blocks.jobs` | Processos automàtics | B25 | — | D19 — consola de clubs |
| `admin-settings:blocks.modules` | Mòduls | B25 | — |  |
| `admin-settings:blocks.privacy` | Privacitat i auditoria | B25 | — | D19 — consola de clubs |
| `admin-settings:blocks.signup` | Alta i consentiments | B25 | — | D19 — consola de clubs |
| `admin-settings:clubPages.defaultLocaleRequired` | Cal completar el títol i el contingut en l'idioma predeterminat del club. | B25 | — |  |
| `admin-settings:clubPages.duplicateKey` | Ja hi ha una pàgina amb aquesta clau. | B25 | — |  |
| `admin-settings:clubPages.editorTitle` | Edita la pàgina | B25 | — |  |
| `admin-settings:clubPages.fixed.IMAGE_CONSENT` | Consentiment d'imatge | B25 | — |  |
| `admin-settings:clubPages.fixed.WELCOME_GUIDE` | Guia de benvinguda | B25 | — |  |
| `admin-settings:clubPages.invalidBody` | Revisa el contingut: només s'admet Markdown limitat i un màxim de 20.000 caràcters. | B25 | — |  |
| `admin-settings:clubPages.key` | Clau de la pàgina | B25 | — |  |
| `admin-settings:clubPages.keyHelp` | Entre 2 i 40 caràcters: minúscules, números i guions. | B25 | — |  |
| `admin-settings:clubPages.loadError` | No s'han pogut carregar les pàgines del club. | B25 | — |  |
| `admin-settings:clubPages.markdownHelp` | Admet títols, paràgrafs, negreta, cursiva, llistes i enllaços. | B25 | — |  |
| `admin-settings:clubPages.noContent` | sense contingut | B25 | — |  |
| `admin-settings:clubPages.previewEmpty` | La vista prèvia apareixerà aquí. | B25 | — |  |
| `admin-settings:clubPages.provisional` | Text provisional — pendent d'omplir | B25 | — |  |
| `admin-settings:clubPages.publishConfirmation` | Es publicarà la versió {version} — els consentiments futurs hi faran referència | B25 | — |  |
| `admin-settings:clubPages.publishTitle` | Publica la pàgina | B25 | — |  |
| `admin-settings:clubPages.saveDraft` | Desa l'esborrany | B25 | — |  |
| `admin-settings:clubPages.stale` | Un altre administrador ha editat aquesta pàgina — recarrega | B25 | — |  |
| `admin-settings:common.loading` | Carregant | B25 | — |  |
| `admin-settings:common.saving` | Desant | B25 | — |  |
| `admin-settings:derived.freeTrainingLevels.label` | Nivells amb entrenament lliure: | B25 | — |  |
| `admin-settings:derived.sepaCreditor.configured` | configurat · edició a la consola de clubs | B25 | — |  |
| `admin-settings:derived.sepaCreditor.notConfigured` | no configurat | B25 | — |  |
| `admin-settings:editor.addHoliday` | Afegeix un festiu | B25 | — |  |
| `admin-settings:editor.appliesFromNow` | S'aplica a partir d'ara. | B25 | — | D19 — consola de clubs |
| `admin-settings:editor.coverage.ok` | Cobertura correcta per sobre de (%) | B25 | — |  |
| `admin-settings:editor.coverage.short` | Cal ampliar per sota de (%) | B25 | — |  |
| `admin-settings:editor.coverage.tight` | Cobertura ajustada per sobre de (%) | B25 | — |  |
| `admin-settings:editor.dayOfWeek` | Dia de la setmana | B25 | — |  |
| `admin-settings:editor.defaultLocaleRequired` | Cal completar el text en l'idioma predeterminat del club. | B25 | — |  |
| `admin-settings:editor.holidayDate` | Data del festiu {index} | B25 | — |  |
| `admin-settings:editor.holidayLabel` | Nom del festiu {index} | B25 | — |  |
| `admin-settings:editor.invalidCoverage` | Els llindars han d'anar de més gran a més petit. | B25 | — |  |
| `admin-settings:editor.invalidJson` | El JSON no és vàlid. | B25 | — | D19 — consola de clubs |
| `admin-settings:editor.invalidOpeningHours` | L'hora d'obertura ha de ser anterior al tancament i usar intervals de 5 minuts. | B25 | — |  |
| `admin-settings:editor.noHolidays` | Encara no hi ha cap festiu. | B25 | — |  |
| `admin-settings:editor.opens` | Obertura de {day} | B25 | — |  |
| `admin-settings:editor.reason` | Motiu del canvi (opcional) | B25 | — | D19 — consola de clubs |
| `admin-settings:editor.removeHoliday` | Elimina el festiu {index} | B25 | — |  |
| `admin-settings:editor.reset` | Restableix el valor de producte | B25 | — |  |
| `admin-settings:editor.reviewCashConditions` | Si canvies aquest valor, revisa també el text de les condicions de pagament en efectiu de l'alta. | B25 | — |  |
| `admin-settings:editor.reviewPaymentDay` | Si canvies aquest valor, revisa també el text del dia de pagament de l'alta. | B25 | — |  |
| `admin-settings:enum.activities.cancelDeadline.EVENT_START` | Fins a l'inici de l'activitat | B25 | — |  |
| `admin-settings:enum.activities.cancelDeadline.REGISTRATION_CLOSE` | Fins al tancament de les inscripcions | B25 | — |  |
| `admin-settings:enum.billing.accountingExportFormat.CSV` | CSV | B25 | — |  |
| `admin-settings:enum.billing.accountingExportFormat.XLSX` | XLSX | B25 | — |  |
| `admin-settings:enum.billing.cashInvoicing.SEMESTER` | Semestral | B25 | — |  |
| `admin-settings:enum.billing.singleClassCancelPolicy.CREDIT` | Crèdit | B25 | — |  |
| `admin-settings:enum.billing.singleClassCancelPolicy.NONE` | Sense retorn | B25 | — |  |
| `admin-settings:enum.billing.singleClassCancelPolicy.REFUND` | Devolució | B25 | — |  |
| `admin-settings:enum.waitlist.mode.ALL_AT_ONCE` | Avís a tothom alhora | B25 | — |  |
| `admin-settings:enum.waitlist.mode.FIFO` | Per ordre d'entrada | B25 | — |  |
| `admin-settings:history.open` | Mostra l'històric de {label} | B25 | — |  |
| `admin-settings:jobs.cadence.DAILY` | cada dia a les {time} | B25 | — |  |
| `admin-settings:jobs.counter.activitiesFinished` | {count, plural, one {# activitat tancada} other {# activitats tancades}} | B25 | — | D19 — consola de clubs |
| `admin-settings:jobs.counter.cancelledSilent` | {count, plural, one {# sense inscrits} other {# sense inscrits}} | B25 | — | D19 — consola de clubs |
| `admin-settings:jobs.counter.classReminders` | {count, plural, one {# recordatori de classe} other {# recordatoris de classe}} | B25 | — | D19 — consola de clubs |
| `admin-settings:jobs.counter.domainEventsDeleted` | {count, plural, one {# esdeveniment intern esborrat} other {# esdeveniments interns esborrats}} | B25 | — | D19 — consola de clubs |
| `admin-settings:jobs.counter.exempt` | {count, plural, one {# exempta} other {# exemptes}} | B25 | — | D19 — consola de clubs |
| `admin-settings:jobs.counter.exportsPurged` | {count, plural, one {# exportació caducada esborrada} other {# exportacions caducades esborrades}} | B25 | — | D19 — consola de clubs |
| `admin-settings:jobs.counter.finished` | {count, plural, one {# classe tancada} other {# classes tancades}} | B25 | — | D19 — consola de clubs |
| `admin-settings:jobs.counter.jobRunsDeleted` | {count, plural, one {# execució antiga esborrada} other {# execucions antigues esborrades}} | B25 | — | D19 — consola de clubs |
| `admin-settings:jobs.counter.late` | {count, plural, one {# amb retard} other {# amb retard}} | B25 | — | D19 — consola de clubs |
| `admin-settings:jobs.counter.notified` | {count, plural, one {# avís enviat} other {# avisos enviats}} | B25 | — | D19 — consola de clubs |
| `admin-settings:jobs.counter.notifiedMembers` | {count, plural, one {# alumne avisat} other {# alumnes avisats}} | B25 | — | D19 — consola de clubs |
| `admin-settings:jobs.counter.opened` | {count, plural, one {# setmana oberta} other {# setmanes obertes}} | B25 | — | D19 — consola de clubs |
| `admin-settings:jobs.counter.orphanUploadsDeleted` | {count, plural, one {# fitxer d'alta orfe esborrat} other {# fitxers d'alta orfes esborrats}} | B25 | — | D19 — consola de clubs |
| `admin-settings:jobs.counter.reviewed` | {count, plural, one {# classe revisada} other {# classes revisades}} | B25 | — | D19 — consola de clubs |
| `admin-settings:jobs.counter.skippedStarted` | {count, plural, one {# ja començada} other {# ja començades}} | B25 | — | D19 — consola de clubs |
| `admin-settings:jobs.counter.stripeEventsDeleted` | {count, plural, one {# esdeveniment de Stripe esborrat} other {# esdeveniments de Stripe esborrats}} | B25 | — | D19 — consola de clubs |
| `admin-settings:jobs.counter.swept` | {count, plural, one {# entrada d'espera tancada} other {# entrades d'espera tancades}} | B25 | — | D19 — consola de clubs |
| `admin-settings:jobs.counter.trainingReminders` | {count, plural, one {# recordatori d'entrenament} other {# recordatoris d'entrenament}} | B25 | — | D19 — consola de clubs |
| `admin-settings:jobs.counter.ttlPendingIdempotencyRecords` | {count, plural, one {# registre de reintents caducat} other {# registres de reintents caducats}} | B25 | — | D19 — consola de clubs |
| `admin-settings:jobs.counter.ttlPendingJobLocks` | {count, plural, one {# bloqueig de procés caducat} other {# bloquejos de procés caducats}} | B25 | — | D19 — consola de clubs |
| `admin-settings:jobs.counter.ttlPendingMagicLinkTokens` | {count, plural, one {# enllaç d'accés caducat} other {# enllaços d'accés caducats}} | B25 | — | D19 — consola de clubs |
| `admin-settings:jobs.counter.ttlPendingRingSlotLocks` | {count, plural, one {# bloqueig tècnic de pista caducat} other {# bloquejos tècnics de pista caducats}} | B25 | — | D19 — consola de clubs |
| `admin-settings:jobs.counter.ttlPendingSeatHolds` | {count, plural, one {# bloqueig temporal de plaça caducat} other {# bloquejos temporals de plaça caducats}} | B25 | — | D19 — consola de clubs |
| `admin-settings:jobs.counter.ttlPendingSignupNotificationAdmissions` | {count, plural, one {# control d'avís d'alta caducat} other {# controls d'avís d'alta caducats}} | B25 | — | D19 — consola de clubs |
| `admin-settings:jobs.counter.WOULD_REMIND` | {count, plural, one {# recordatori previst} other {# recordatoris previstos}} | B25 | — | D19 — consola de clubs |
| `admin-settings:jobs.disableConfirm` | Els efectes d'aquest procés deixaran d'aplicar-se fins que el tornis a activar. | B25 | — |  |
| `admin-settings:jobs.dryRunNote` | Simulació: no s'ha aplicat cap canvi. | B25 | — | D19 — consola de clubs |
| `admin-settings:jobs.dryRunTitle` | Simulació: què faria ara · {name} | B25 | — |  |
| `admin-settings:jobs.impersonationNote` | Els processos automàtics no es poden gestionar mentre actues com un abonat. | B25 | — |  |
| `admin-settings:jobs.lastRun.never` | encara no s'ha executat | B25 | — | D19 — consola de clubs |
| `admin-settings:jobs.name.BILLING_REMINDER` | Recordatori de facturació | B25 | — | D19 — consola de clubs |
| `admin-settings:jobs.name.CLASS_FINISHING` | Tancament de classes | B25 | — | D19 — consola de clubs |
| `admin-settings:jobs.name.CLEANUP` | Neteja tècnica | B25 | — | D19 — consola de clubs |
| `admin-settings:jobs.name.ERASURES` | Supressió de dades | B25 | — | D19 — consola de clubs |
| `admin-settings:jobs.name.EXPIRATIONS` | Caducitats | B25 | — | D19 — consola de clubs |
| `admin-settings:jobs.name.NO_SHOW_NOTICES` | Avisos de no presentat | B25 | — | D19 — consola de clubs |
| `admin-settings:jobs.name.PAYMENT_TIMEOUTS` | Temps de pagament exhaurit | B25 | — | D19 — consola de clubs |
| `admin-settings:jobs.name.RETENTION_SWEEP` | Retenció de dades | B25 | — | D19 — consola de clubs |
| `admin-settings:jobs.name.WAITLIST_FIFO` | Llista d'espera (FIFO) | B25 | — | D19 — consola de clubs |
| `admin-settings:jobs.name.WEEK_OPENING` | Obertura de la setmana | B25 | — | D19 — consola de clubs |
| `admin-settings:jobs.noItems` | No hi ha res a fer. | B25 | — |  |
| `admin-settings:jobs.run` | Executa ara | B25 | — | D19 — consola de clubs |
| `admin-settings:jobs.runConfirm` | El procés s'executarà ara, encara que estigui desactivat, i en quedarà constància a l'auditoria. | B25 | — | D19 — consola de clubs |
| `admin-settings:jobs.runLabel` | Executa ara {name} | B25 | — | D19 — consola de clubs |
| `admin-settings:jobs.running` | S'està executant… | B25 | — | D19 — consola de clubs |
| `admin-settings:jobs.runs.caption` | Darreres execucions | B25 | — |  |
| `admin-settings:jobs.runs.clear` | Treu els filtres | B25 | — |  |
| `admin-settings:jobs.runs.detail` | Fitxa de l'execució | B25 | — |  |
| `admin-settings:jobs.runs.dryRun` | Simulacions | B25 | — |  |
| `admin-settings:jobs.runs.dryRunOnly` | només simulacions | B25 | — |  |
| `admin-settings:jobs.runs.effects` | Efectes | B25 | — |  |
| `admin-settings:jobs.runs.empty` | Encara no hi ha execucions. | B25 | — |  |
| `admin-settings:jobs.runs.emptyFiltered` | Cap execució amb aquests filtres. | B25 | — |  |
| `admin-settings:jobs.runs.errors` | Errors | B25 | — |  |
| `admin-settings:jobs.runs.filters` | Filtra les execucions | B25 | — |  |
| `admin-settings:jobs.runs.nextPage` | Pàgina següent | B25 | — |  |
| `admin-settings:jobs.runs.pages` | Pàgines de l'historial | B25 | — |  |
| `admin-settings:jobs.runs.previousPage` | Pàgina anterior | B25 | — |  |
| `admin-settings:jobs.runs.realOnly` | sense simulacions | B25 | — |  |
| `admin-settings:jobs.runs.title` | Execucions · {name} | B25 | — |  |
| `admin-settings:jobs.runs.trigger` | Origen | B25 | — |  |
| `admin-settings:jobs.runs.when` | Ocurrència | B25 | — |  |
| `admin-settings:jobs.runTitle` | Executar «{name}» ara | B25 | — | D19 — consola de clubs |
| `admin-settings:jobs.title` | Processos automàtics | B25 | — |  |
| `admin-settings:modules.FAQ.help` | Mostra la pàgina de preguntes freqüents a l'app. | B25 | — |  |
| `admin-settings:modules.LEARN_LINK.help` | Mostra l'accés a Learn al menú de l'app. | B25 | — |  |
| `admin-settings:modules.LEARN_LINK.label` | Enllaç a Learn | B25 | — |  |
| `admin-settings:modules.PUSH.help` | Permet rebre notificacions web al dispositiu. | B25 | — |  |
| `admin-settings:param.activities.cancelDeadline.help` | Moment límit perquè una persona anul·li la inscripció. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.activities.cancelDeadline.label` | Anul·lació d'activitats fins a | B25 | — | D19 — consola de clubs |
| `admin-settings:param.activities.publicUrlTemplate.help` | Plantilla de l'enllaç públic de cada activitat. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.activities.publicUrlTemplate.label` | Enllaç públic de les activitats | B25 | — | D19 — consola de clubs |
| `admin-settings:param.attendance.editDays.help` | Dies disponibles per corregir l'assistència. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.attendance.editDays.label` | Termini per editar assistències | B25 | — | D19 — consola de clubs |
| `admin-settings:param.audit.retentionYears.help` | Anys durant els quals es conserva l'auditoria. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.audit.retentionYears.label` | Conservació de l'auditoria | B25 | — | D19 — consola de clubs |
| `admin-settings:param.auth.checkCompromisedPasswords.help` | Comprova si una contrasenya consta en filtracions conegudes abans d'acceptar-la. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.auth.checkCompromisedPasswords.label` | Comprovació de contrasenyes compromeses | B25 | — | D19 — consola de clubs |
| `admin-settings:param.auth.impersonationMinutes.help` | Minuts de vigència de l'accés «Entra com l'abonat». | B25 | — | D19 — consola de clubs |
| `admin-settings:param.auth.impersonationMinutes.label` | Durada de l'accés com a abonat | B25 | — | D19 — consola de clubs |
| `admin-settings:param.auth.lockoutMaxAttempts.help` | Nombre d'intents fallits abans de bloquejar temporalment l'accés. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.auth.lockoutMaxAttempts.label` | Intents abans del bloqueig | B25 | — | D19 — consola de clubs |
| `admin-settings:param.auth.lockoutMinutes.help` | Minuts que dura el bloqueig després de superar els intents permesos. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.auth.lockoutMinutes.label` | Durada del bloqueig d'accés | B25 | — | D19 — consola de clubs |
| `admin-settings:param.auth.magicLinkMinutes.help` | Minuts de vigència d'un enllaç màgic d'accés. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.auth.magicLinkMinutes.label` | Durada de l'enllaç màgic | B25 | — | D19 — consola de clubs |
| `admin-settings:param.auth.maxSessions.help` | Nombre màxim de sessions obertes alhora per compte. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.auth.maxSessions.label` | Màxim de sessions per compte | B25 | — | D19 — consola de clubs |
| `admin-settings:param.auth.passwordMinLength.help` | Nombre mínim de caràcters d'una contrasenya. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.auth.passwordMinLength.label` | Longitud mínima de la contrasenya | B25 | — | D19 — consola de clubs |
| `admin-settings:param.auth.refreshReuseGraceSeconds.help` | Segons durant els quals es pot recuperar una única resposta de renovació perduda. Un valor de 0 desactiva el marge. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.auth.refreshReuseGraceSeconds.label` | Marge de reutilització del token de renovació | B25 | — | D19 — consola de clubs |
| `admin-settings:param.auth.sessionDays.help` | Dies de vigència de la sessió amb renovació lliscant. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.auth.sessionDays.label` | Durada de la sessió | B25 | — | D19 — consola de clubs |
| `admin-settings:param.auth.welcomeLinkDays.help` | Dies de vigència de l'enllaç de benvinguda i activació. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.auth.welcomeLinkDays.label` | Durada de l'enllaç de benvinguda | B25 | — | D19 — consola de clubs |
| `admin-settings:param.billing.accountingExportFormat.help` | Format predeterminat de les exportacions comptables. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.billing.accountingExportFormat.label` | Format d'exportació comptable | B25 | — | D19 — consola de clubs |
| `admin-settings:param.billing.cashInvoicing.help` | Periodicitat de facturació dels pagaments en efectiu. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.billing.cashInvoicing.label` | Facturació en efectiu | B25 | — | D19 — consola de clubs |
| `admin-settings:param.billing.cashPeriodMonths.help` | Mesos que inclou cada període de pagament en efectiu. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.billing.cashPeriodMonths.label` | Període de pagament en efectiu | B25 | — | D19 — consola de clubs |
| `admin-settings:param.billing.entryFeePerDog.help` | Import d'entrada aplicat a cada gos. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.billing.familyDiscountPercentFromSecondDog.help` | Descompte proposat des del segon gos del grup familiar. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.billing.familyDiscountPercentFromSecondDog.label` | Descompte familiar des del segon gos | B25 | — | D19 — consola de clubs |
| `admin-settings:param.billing.inactivityFeeFirstMonth.help` | Quota d'inactivitat del primer mes. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.billing.inactivityFeeFirstMonth.label` | Quota d'inactivitat · primer mes | B25 | — | D19 — consola de clubs |
| `admin-settings:param.billing.inactivityFeeFollowingMonths.help` | Quota d'inactivitat dels mesos següents. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.billing.inactivityFeeFollowingMonths.label` | Quota d'inactivitat · mesos següents | B25 | — | D19 — consola de clubs |
| `admin-settings:param.billing.invoiceResetYearly.help` | Reinicia la numeració dels rebuts cada any. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.billing.invoiceResetYearly.label` | Reinici anual de la numeració | B25 | — | D19 — consola de clubs |
| `admin-settings:param.billing.invoiceSeriesPattern.help` | Patró de la sèrie anual de rebuts. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.billing.nextInvoiceDayOfMonth.help` | Dia del mes del proper rebut. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.billing.nextInvoiceDayOfMonth.label` | Dia del proper rebut | B25 | — | D19 — consola de clubs |
| `admin-settings:param.billing.packExpiryWarningDays.help` | Dies d'antelació de l'avís de caducitat del pack. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.billing.packExpiryWarningDays.label` | Avís de caducitat del pack | B25 | — | D19 — consola de clubs |
| `admin-settings:param.billing.packLowBalanceSessions.help` | Sessions restants que activen l'avís de saldo baix. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.billing.packLowBalanceSessions.label` | Avís de saldo baix del pack | B25 | — | D19 — consola de clubs |
| `admin-settings:param.billing.packToMemberEntryDiscountPercent.help` | Descompte d'entrada en passar de pack a abonament. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.billing.packToMemberEntryDiscountPercent.label` | Descompte d'entrada després d'un pack | B25 | — | D19 — consola de clubs |
| `admin-settings:param.billing.packToMemberMinSessions.help` | Sessions mínimes del pack per obtenir el descompte. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.billing.packToMemberMinSessions.label` | Sessions mínimes per al descompte | B25 | — | D19 — consola de clubs |
| `admin-settings:param.billing.remittanceReminderDay.help` | Dia de l'avís per preparar la remesa; 0 el desactiva. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.billing.remittanceReminderDay.label` | Recordatori de la remesa | B25 | — | D19 — consola de clubs |
| `admin-settings:param.billing.sepa.collectionDayOfMonth.help` | Dia del mes facturat en què es cobra la quota; 0 vol dir l'últim dia d'aquell mes. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.billing.sepa.collectionDayOfMonth.label` | Dia de cobrament SEPA | B25 | — | D19 — consola de clubs |
| `admin-settings:param.billing.sepa.schema.help` | Esquema del fitxer de remesa SEPA. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.billing.sepa.schema.label` | Esquema SEPA | B25 | — | D19 — consola de clubs |
| `admin-settings:param.billing.sepa.useFrst.help` | Usa la seqüència inicial abans dels cobraments recurrents. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.billing.sepa.useFrst.label` | Seqüència inicial SEPA | B25 | — | D19 — consola de clubs |
| `admin-settings:param.billing.singleClassCancelPolicy.help` | Tractament del pagament quan s'anul·la dins del termini. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.billing.singleClassCancelPolicy.label` | Política d'anul·lació de classe individual | B25 | — | D19 — consola de clubs |
| `admin-settings:param.billing.stripeMaxAttempts.help` | Nombre màxim d'intents de cobrament. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.billing.stripeMaxAttempts.label` | Intents màxims de cobrament | B25 | — | D19 — consola de clubs |
| `admin-settings:param.billing.stripeReceiptEmail.help` | Envia el rebut de Stripe per correu. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.billing.stripeReceiptEmail.label` | Rebut de Stripe per correu | B25 | — | D19 — consola de clubs |
| `admin-settings:param.billing.taxIncluded.help` | Indica si els imports ja inclouen impostos. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.billing.taxIncluded.label` | Impostos inclosos | B25 | — | D19 — consola de clubs |
| `admin-settings:param.billing.upfrontCutoffDay.help` | Dia límit per demanar una alta per al mes següent. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.billing.upfrontCutoffDay.label` | Dia límit d'altes del mes següent | B25 | — | D19 — consola de clubs |
| `admin-settings:param.bookings.instructorLastMinuteNotice.help` | Permet que l'instructor indiqui que l'alumne ha avisat. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.bookings.instructorLastMinuteNotice.label` | Avís d'última hora per l'instructor | B25 | — | D19 — consola de clubs |
| `admin-settings:param.bookings.lateCancelThresholdMinutes.help` | A partir d'aquest llindar l'anul·lació compta com a classe feta. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.bookings.limitUnit.help` | Unitat a la qual s'apliquen els límits de reserva. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.bookings.limitUnit.label` | Unitat dels límits de reserva | B25 | — | D19 — consola de clubs |
| `admin-settings:param.bookings.maxCurrentWeek.help` | Màxim de classes reservables durant la setmana en curs. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.bookings.maxNextWeek.help` | Màxim de classes reservables durant la setmana següent. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.bookings.paymentPendingMinutes.help` | Temps disponible per completar el pagament d'una reserva. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.bookings.paymentPendingMinutes.label` | Temps per completar el pagament | B25 | — | D19 — consola de clubs |
| `admin-settings:param.bookings.seatHoldSeconds.help` | Temps durant el qual una plaça queda retinguda. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.bookings.seatHoldSeconds.label` | Retenció temporal d'una plaça | B25 | — | D19 — consola de clubs |
| `admin-settings:param.bookings.showInstructorHoursBefore.help` | Antelació amb què l'abonat veu l'instructor. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.bookings.weekOpensAt.help` | Hora local en què s'obren les reserves de la setmana següent. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.census.bookingBlockReasons.help` | Motius disponibles per bloquejar les reserves. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.census.bookingBlockReasons.label` | Motius de bloqueig de reserves | B25 | — | D19 — consola de clubs |
| `admin-settings:param.census.dogDocumentTypes.help` | Documents disponibles per als gossos i obligatorietat. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.census.dogDocumentTypes.label` | Documents dels gossos | B25 | — | D19 — consola de clubs |
| `admin-settings:param.classes.defaultCapacity.help` | Aforament per defecte; cada classe usa el mínim dels seus nivells. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.classes.defaultCapacity.label` | Aforament per defecte (nivell sense valor) | B25 | — | D19 — consola de clubs |
| `admin-settings:param.classes.finishGraceMinutes.help` | Marge després de l'hora final abans de tancar la classe. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.classes.finishGraceMinutes.label` | Marge per finalitzar classes | B25 | — | D19 — consola de clubs |
| `admin-settings:param.classes.maxInstructorsPerClass.help` | Nombre màxim d'instructors assignables a una classe. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.classes.maxInstructorsPerClass.label` | Màx. instructors per classe | B25 | — | D19 — consola de clubs |
| `admin-settings:param.classes.minDogs.help` | Nombre mínim de gossos perquè una classe no estigui en risc. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.classes.minDogs.label` | Mínim de gossos per classe | B25 | — | D19 — consola de clubs |
| `admin-settings:param.classes.riskAutoCancelSameDay.help` | Anul·la automàticament les classes en risc del mateix dia. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.classes.riskAutoCancelSameDay.label` | Anul·lació automàtica el mateix dia | B25 | — | D19 — consola de clubs |
| `admin-settings:param.classes.riskLookaheadDays.help` | Dies vista inclosos en la revisió de classes en risc. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.classes.riskReviewTime.help` | Hora local de la revisió de classes en risc. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.classes.riskReviewTime.label` | Revisió de classes en risc · hora | B25 | — | D19 — consola de clubs |
| `admin-settings:param.classes.slotMinutes.help` | Granularitat de la graella de plantilles. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.classes.slotMinutes.label` | Durada de la franja de plantilla | B25 | — | D19 — consola de clubs |
| `admin-settings:param.club.holidays.help` | Dates locals en què no es generen classes ni entrenaments. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.club.holidays.label` | Festius | B25 | — | D19 — consola de clubs |
| `admin-settings:param.club.openingHours.help` | Horari setmanal del club amb intervals de 5 minuts. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.club.privacyPolicyUrl.help` | Enllaç a la política de privacitat del club. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.courses.allowInstructorPublish.help` | Permet que l'instructor publiqui muntatges. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.courses.allowInstructorPublish.label` | Publicació de muntatges pels instructors | B25 | — | D19 — consola de clubs |
| `admin-settings:param.courses.buildSessionMaxHours.help` | Durada màxima d'una sessió de muntatge. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.courses.buildSessionMaxHours.label` | Durada màxima de la sessió de muntatge | B25 | — | D19 — consola de clubs |
| `admin-settings:param.courses.defaultWarningThresholdM.help` | Distància mínima, en metres, per sota de la qual col·locar un recorregut a la pista genera un avís. | B25 | aprovat (A39.190) | D19 — consola de clubs |
| `admin-settings:param.courses.defaultWarningThresholdM.label` | Llindar d'avís de col·locació | B25 | aprovat (A39.189) | D19 — consola de clubs |
| `admin-settings:param.courses.setupAutoExpireDays.help` | Dies fins que un recorregut muntat caduca automàticament. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.courses.setupAutoExpireDays.label` | Caducitat del recorregut muntat | B25 | — | D19 — consola de clubs |
| `admin-settings:param.courses.showSetupToMembers.help` | Mostra als abonats el recorregut muntat. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.courses.showSetupToMembers.label` | Mostra el recorregut als abonats | B25 | — | D19 — consola de clubs |
| `admin-settings:param.coverage.activeDogWeeks.help` | Setmanes considerades per determinar els gossos actius. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.coverage.activeDogWeeks.label` | Període de gossos actius | B25 | — | D19 — consola de clubs |
| `admin-settings:param.coverage.thresholds.help` | Llindars percentuals de cobertura correcta, ajustada i curta. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.coverage.thresholds.label` | Llindars de cobertura | B25 | — | D19 — consola de clubs |
| `admin-settings:param.dashboard.pendingSignupAgeWarnDays.help` | Dies a partir dels quals una preinscripció pendent es destaca al tauler. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.dashboard.pendingSignupAgeWarnDays.label` | Avís d'antiguitat de les preinscripcions | B25 | — | D19 — consola de clubs |
| `admin-settings:param.files.allowedTypes.help` | Tipus MIME que es poden pujar com a fitxers. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.files.allowedTypes.label` | Tipus de fitxer permesos | B25 | — | D19 — consola de clubs |
| `admin-settings:param.files.dogPhotoMaxMb.help` | Mida màxima, en MB, de la foto d'un gos. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.files.dogPhotoMaxMb.label` | Mida màxima de la foto del gos | B25 | — | D19 — consola de clubs |
| `admin-settings:param.files.maxAttachmentsPerEntity.help` | Nombre màxim de fitxers adjunts en una mateixa fitxa. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.files.maxAttachmentsPerEntity.label` | Màxim de fitxers adjunts | B25 | — | D19 — consola de clubs |
| `admin-settings:param.files.maxSizeMb.help` | Mida màxima, en MB, de cada fitxer adjunt. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.files.maxSizeMb.label` | Mida màxima per fitxer | B25 | — | D19 — consola de clubs |
| `admin-settings:param.history.monthsVisible.help` | Mesos d'històric que es mostren a l'app. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.history.monthsVisible.label` | Mesos visibles de l'històric | B25 | — | D19 — consola de clubs |
| `admin-settings:param.inactivity.cancelBookingsOnApproval.help` | Anul·la les reserves quan s'aprova una inactivitat. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.inactivity.cancelBookingsOnApproval.label` | Anul·la reserves en aprovar la inactivitat | B25 | — | D19 — consola de clubs |
| `admin-settings:param.inactivity.maxStartMonthsAhead.help` | Mesos màxims d'antelació per iniciar una inactivitat. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.inactivity.maxStartMonthsAhead.label` | Antelació màxima d'una inactivitat | B25 | — | D19 — consola de clubs |
| `admin-settings:param.inactivity.requestDeadlineDay.help` | Dia límit del mes anterior per sol·licitar canvis. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.inactivity.requestDeadlineDay.label` | Dia límit de sol·licitud d'inactivitat | B25 | — | D19 — consola de clubs |
| `admin-settings:param.jobs.alertAdminsOnFailure.help` | Envia un avís als administradors quan un procés automàtic falla o no s'executa. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.jobs.alertAdminsOnFailure.label` | Avís als administradors si un procés falla | B25 | — | D19 — consola de clubs |
| `admin-settings:param.jobs.billingReminder.enabled.help` | Recorda a l'administració que encara no s'ha generat la remesa del mes. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.jobs.billingReminder.enabled.label` | Recordatori de remesa | B25 | — | D19 — consola de clubs |
| `admin-settings:param.jobs.classFinishing.enabled.help` | Tanca les classes quan s'acaben. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.jobs.classFinishing.enabled.label` | Finalització de classes | B25 | — | D19 — consola de clubs |
| `admin-settings:param.jobs.cleanup.enabled.help` | Esborra cada dia les dades tècniques caducades. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.jobs.dailyTime.help` | Hora local del club a la qual s'executen els venciments, la neteja i el recordatori de remesa. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.jobs.dailyTime.label` | Hora dels processos diaris | B25 | — | D19 — consola de clubs |
| `admin-settings:param.jobs.expirations.enabled.help` | Tracta cada dia els venciments: preinscripcions, documents, packs, inactivitats i baixes. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.jobs.noShowNotices.enabled.help` | Envia cada dia els avisos de les absències sense avís. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.jobs.noShowNotices.enabled.label` | Avisos de no presentats | B25 | — | D19 — consola de clubs |
| `admin-settings:param.jobs.paymentTimeouts.enabled.help` | Allibera les places de les reserves amb el pagament caducat. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.jobs.paymentTimeouts.enabled.label` | Pagaments pendents | B25 | — | D19 — consola de clubs |
| `admin-settings:param.jobs.reminders.enabled.help` | Envia els recordatoris de classes i entrenaments. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.jobs.retention.domainEventsDays.help` | Dies durant els quals es conserven els esdeveniments de domini. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.jobs.retention.domainEventsDays.label` | Conservació dels esdeveniments de domini | B25 | — | D19 — consola de clubs |
| `admin-settings:param.jobs.retention.exportFilesDays.help` | Dies durant els quals es conserven els fitxers d'exportació. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.jobs.retention.exportFilesDays.label` | Conservació dels fitxers d'exportació | B25 | — | D19 — consola de clubs |
| `admin-settings:param.jobs.retention.jobRunsDays.help` | Dies durant els quals es conserva l'històric d'execucions dels processos. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.jobs.retention.jobRunsDays.label` | Conservació de les execucions | B25 | — | D19 — consola de clubs |
| `admin-settings:param.jobs.retention.orphanUploadsHours.help` | Hores abans d'eliminar una pujada que no s'ha vinculat a cap fitxa. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.jobs.retention.orphanUploadsHours.label` | Conservació de les pujades orfes | B25 | — | D19 — consola de clubs |
| `admin-settings:param.jobs.retention.stripeEventsDays.help` | Dies durant els quals es conserven els esdeveniments rebuts de Stripe. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.jobs.retention.stripeEventsDays.label` | Conservació dels esdeveniments de Stripe | B25 | — | D19 — consola de clubs |
| `admin-settings:param.jobs.riskReview.enabled.help` | Revisa cada dia les classes amb pocs inscrits i les anul·la o avisa. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.jobs.waitlistFifo.enabled.help` | Ofereix les places lliures per ordre quan la llista d'espera és per ordre d'entrada. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.jobs.waitlistFifo.enabled.label` | Llista d'espera per torns | B25 | — | D19 — consola de clubs |
| `admin-settings:param.jobs.weekOpening.enabled.help` | Obre les reserves de la setmana vinent a l'hora configurada a Classes. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.learn.baseUrl.help` | Adreça base del producte Learn. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.learn.baseUrl.label` | Adreça de Learn | B25 | — | D19 — consola de clubs |
| `admin-settings:param.learn.linkText.help` | Text de l'accés a Learn que es mostra a l'app. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.learn.linkText.label` | Text de l'enllaç a Learn | B25 | — | D19 — consola de clubs |
| `admin-settings:param.learn.recommendationsTtlMinutes.help` | Minuts durant els quals es conserven les recomanacions de Learn. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.learn.recommendationsTtlMinutes.label` | Vigència de les recomanacions de Learn | B25 | — | D19 — consola de clubs |
| `admin-settings:param.leave.fullMonthIfLater.help` | Cobra el mes sencer quan la baixa és posterior al límit. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.leave.fullMonthIfLater.label` | Mes sencer en baixes fora de termini | B25 | — | D19 — consola de clubs |
| `admin-settings:param.leave.npsEnabled.help` | Demana una valoració en completar la baixa. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.leave.npsEnabled.label` | Valoració en la baixa | B25 | — | D19 — consola de clubs |
| `admin-settings:param.leave.packExpiryGraceDays.help` | Dies de marge després de caducar el pack. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.leave.packExpiryGraceDays.label` | Marge de caducitat del pack | B25 | — | D19 — consola de clubs |
| `admin-settings:param.leave.reasons.help` | Motius disponibles en el procés de baixa. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.leave.reasons.label` | Motius de baixa | B25 | — | D19 — consola de clubs |
| `admin-settings:param.legal.maxPostpones.help` | Vegades que es pot ajornar l'acceptació d'una política nova. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.legal.maxPostpones.label` | Ajornaments de la política | B25 | — | D19 — consola de clubs |
| `admin-settings:param.levels.enabled.help` | Activa el catàleg local de nivells. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.levels.enabled.label` | Nivells actius | B25 | — | D19 — consola de clubs |
| `admin-settings:param.messaging.documentReminderDays.help` | Dies d'antelació dels recordatoris de documentació; 0 deixa només l'enviament manual. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.messaging.documentReminderDays.label` | Recordatori de documentació | B25 | — | D19 — consola de clubs |
| `admin-settings:param.messaging.email.fromAddress.help` | Adreça verificada des d'on s'envien els correus. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.messaging.email.fromAddress.label` | Adreça remitent | B25 | — | D19 — consola de clubs |
| `admin-settings:param.messaging.email.fromName.help` | Nom del club que apareix com a remitent. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.messaging.email.fromName.label` | Nom del remitent | B25 | — | D19 — consola de clubs |
| `admin-settings:param.messaging.email.replyTo.help` | Adreça de resposta; en blanc s'usa el contacte del club. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.messaging.email.replyTo.label` | Adreça de resposta | B25 | — | D19 — consola de clubs |
| `admin-settings:param.messaging.noShowNoticeTime.help` | Hora d'enviament dels avisos de no assistència de l'endemà. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.messaging.notifyNewRingSetup.help` | Avisa quan hi ha un recorregut nou muntat. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.messaging.notifyNewRingSetup.label` | Avís de recorregut nou | B25 | — | D19 — consola de clubs |
| `admin-settings:param.messaging.notifyWeekOpening.help` | Avisa quan s'obre la setmana següent. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.messaging.notifyWeekOpening.label` | Avís d'obertura de setmana | B25 | — | D19 — consola de clubs |
| `admin-settings:param.messaging.push.ttlMinutes.help` | Minuts durant els quals una notificació push pendent continua vigent. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.messaging.push.ttlMinutes.label` | Vigència de les notificacions push | B25 | — | D19 — consola de clubs |
| `admin-settings:param.messaging.reminderOptionsMinutes.help` | Antelacions que cada abonat pot triar per al recordatori de classe. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.messaging.reminderOptionsMinutes.label` | Opcions del recordatori de classe | B25 | — | D19 — consola de clubs |
| `admin-settings:param.messaging.sms.monthlyCap.help` | Límit mensual de seguretat dels SMS. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.messaging.sms.monthlyCap.label` | Límit mensual d'SMS | B25 | — | D19 — consola de clubs |
| `admin-settings:param.messaging.sms.senderId.help` | Identificador que apareix com a remitent dels SMS. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.messaging.sms.senderId.label` | Remitent dels SMS | B25 | — | D19 — consola de clubs |
| `admin-settings:param.messaging.sms.transliterateToGsm7.help` | Adapta els missatges a l'alfabet GSM-7. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.messaging.sms.transliterateToGsm7.label` | Adaptació dels SMS a GSM-7 | B25 | — | D19 — consola de clubs |
| `admin-settings:param.migration.exportRetentionDays.help` | Dies durant els quals es conserven els fitxers d'exportació d'una migració. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.migration.exportRetentionDays.label` | Conservació de les exportacions de migració | B25 | — | D19 — consola de clubs |
| `admin-settings:param.migration.leftMaxYears.help` | Antiguitat màxima, en anys, de les baixes que s'inclouen en una migració. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.migration.leftMaxYears.label` | Anys màxims de baixes per migrar | B25 | — | D19 — consola de clubs |
| `admin-settings:param.migration.playoffReadOnlyMonths.help` | Mesos durant els quals Playoff es manté en mode de només lectura després de migrar. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.migration.playoffReadOnlyMonths.label` | Mesos de Playoff en només lectura | B25 | — | D19 — consola de clubs |
| `admin-settings:param.migration.reconciliationTolerancePct.help` | Percentatge màxim de diferència admès en la conciliació d'una migració. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.migration.reconciliationTolerancePct.label` | Tolerància de conciliació | B25 | — | D19 — consola de clubs |
| `admin-settings:param.platform.domainRecheckDays.help` | Dies entre les comprovacions automàtiques dels dominis verificats; 0 les desactiva. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.platform.domainRecheckDays.label` | Freqüència de comprovació dels dominis | B25 | — | D19 — consola de clubs |
| `admin-settings:param.platform.supportAccessMinutes.help` | Minuts de vigència d'un accés de suport de l'equip AgilityHub. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.platform.supportAccessMinutes.label` | Durada de l'accés de suport | B25 | — | D19 — consola de clubs |
| `admin-settings:param.rgpd.erasureMinDaysAfterLeave.help` | Dies mínims després de la baixa abans de poder esborrar dades. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.rgpd.erasureMinDaysAfterLeave.label` | Espera mínima abans de l'esborrat | B25 | — | D19 — consola de clubs |
| `admin-settings:param.rgpd.rejectedSignupRetentionDays.help` | Dies de conservació de les sol·licituds rebutjades. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.rgpd.rejectedSignupRetentionDays.label` | Conservació d'altes rebutjades | B25 | — | D19 — consola de clubs |
| `admin-settings:param.rgpd.retentionYearsAfterLeave.help` | Anys de conservació de dades després de la baixa. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.rgpd.retentionYearsAfterLeave.label` | Conservació després de la baixa | B25 | — | D19 — consola de clubs |
| `admin-settings:param.ringBlocks.maxHorizonDays.help` | Dies màxims d'antelació per crear bloquejos de pista. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.ringBlocks.maxHorizonDays.label` | Antelació màxima dels bloquejos | B25 | — | D19 — consola de clubs |
| `admin-settings:param.security.eventRetentionDays.help` | Dies durant els quals es conserven els esdeveniments de seguretat. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.security.eventRetentionDays.label` | Conservació dels esdeveniments de seguretat | B25 | — | D19 — consola de clubs |
| `admin-settings:param.signup.allowFamilyGroupPending.help` | Permet continuar l'alta amb el grup familiar pendent. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.signup.allowFamilyGroupPending.label` | Grup familiar pendent | B25 | — | D19 — consola de clubs |
| `admin-settings:param.signup.enabled.help` | Obre o tanca el formulari públic d'alta. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.signup.enabled.label` | Altes públiques | B25 | — | D19 — consola de clubs |
| `admin-settings:param.signup.firstMonthSplitDay.help` | Dia que separa la quota inicial sencera de la mitja quota. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.signup.firstMonthSplitDay.label` | Tall de la quota del primer mes | B25 | — | D19 — consola de clubs |
| `admin-settings:param.signup.onboardingFields.help` | Camps que es demanen als comptes importats en el primer accés. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.signup.onboardingFields.label` | Camps per completar el perfil | B25 | — | D19 — consola de clubs |
| `admin-settings:param.signup.pendingExpiryDays.help` | Dies fins que una sol·licitud pendent genera un recordatori. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.signup.pendingExpiryDays.label` | Caducitat de les altes pendents | B25 | — | D19 — consola de clubs |
| `admin-settings:param.signup.rateLimit.help` | Límits de seguretat per hora i per dia de les operacions de l'alta pública. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.signup.rateLimit.label` | Límits de peticions de l'alta pública | B25 | — | D19 — consola de clubs |
| `admin-settings:param.signup.requireDogDocumentAtSignup.help` | Demana documentació del gos abans d'acabar l'alta. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.signup.requireDogDocumentAtSignup.label` | Documentació obligatòria durant l'alta | B25 | — | D19 — consola de clubs |
| `admin-settings:param.signup.text.cashConditions.help` | Condicions que es mostren per al pagament en efectiu. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.signup.text.cashConditions.label` | Text del pagament en efectiu | B25 | — | D19 — consola de clubs |
| `admin-settings:param.signup.text.closed.help` | Missatge que es mostra quan les altes són tancades. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.signup.text.closed.label` | Text d'altes tancades | B25 | — | D19 — consola de clubs |
| `admin-settings:param.signup.text.familyGroupIntro.help` | Introducció del pas de grup familiar. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.signup.text.familyGroupIntro.label` | Text del grup familiar | B25 | — | D19 — consola de clubs |
| `admin-settings:param.signup.text.freeTrainingConditions.help` | Condicions d'entrenament lliure mostrades durant l'alta. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.signup.text.freeTrainingConditions.label` | Text d'entrenament lliure | B25 | — | D19 — consola de clubs |
| `admin-settings:param.signup.text.monthlyPaymentIntro.help` | Introducció sobre el cobrament de les quotes mensuals. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.signup.text.monthlyPaymentIntro.label` | Text del pagament mensual | B25 | — | D19 — consola de clubs |
| `admin-settings:param.signup.text.paymentDay.help` | Informació sobre el dia de cobrament i el termini de canvis. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.signup.text.paymentDay.label` | Text del dia de cobrament | B25 | — | D19 — consola de clubs |
| `admin-settings:param.signup.text.therapyIntro.help` | Introducció de la modalitat de teràpia. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.training.bookingWindowDays.help` | Dies naturals d'antelació disponibles per reservar. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.training.cancelThresholdMinutes.help` | Antelació mínima per anul·lar un entrenament. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.training.capacityPerRingSlot.help` | Nombre de gossos que poden entrenar alhora a cada pista. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.training.freeTrainingRequiresLicense.help` | Indica informativament si cal llicència esportiva. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.training.freeTrainingRequiresLicense.label` | Llicència per a entrenament lliure | B25 | — | D19 — consola de clubs |
| `admin-settings:param.training.maxPerWeek.help` | Màxim d'entrenaments per setmana i gos. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.training.slotMinutes.help` | Durada de cada franja d'entrenament. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.waitlist.fifoConfirmMinutes.help` | Temps per confirmar una plaça quan l'avís és per ordre. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.waitlist.fifoConfirmMinutes.label` | Temps de confirmació per ordre | B25 | — | D19 — consola de clubs |
| `admin-settings:param.waitlist.maxPerClass.help` | Nombre màxim de persones a la llista de cada classe. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.waitlist.maxPerDogPerWeek.help` | Nombre màxim de llistes per gos i setmana. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.waitlist.maxPerDogPerWeekIfAttended.help` | Límit aplicat si el gos ja ha fet classe aquella setmana. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.waitlist.maxPerDogPerWeekIfAttended.label` | Màx. llistes si ja ha fet classe | B25 | — | D19 — consola de clubs |
| `admin-settings:param.waitlist.mode.help` | Forma d'oferir una plaça quan queda lliure. | B25 | — | D19 — consola de clubs |
| `admin-settings:param.waitlist.mode.label` | Mode d'avís de la llista d'espera | B25 | — | D19 — consola de clubs |
| `admin-settings:param.waitlist.notifyThresholdMinutes.help` | Només s'avisa si la plaça s'allibera amb més antelació que aquest llindar. | B25 | — | D19 — consola de clubs |
| `admin-settings:value.holidayCount` | {count, plural, one {# festiu} other {# festius}} | B25 | — |  |
| `admin-settings:value.noHolidays` | Cap festiu | B25 | — |  |
| `admin-settings:value.notConfigured` | No configurat | B25 | — |  |
| `enums:jobRunStatus.FAILED` | fallida | B25 | — | D19 — consola de clubs |
| `enums:jobRunStatus.PARTIAL` | parcial | B25 | — | D19 — consola de clubs |
| `enums:jobRunStatus.SKIPPED` | omesa | B25 | — | D19 — consola de clubs |
| `enums:jobRunStatus.SUCCEEDED` | correcta | B25 | — | D19 — consola de clubs |
| `enums:jobTrigger.CATCH_UP` | recuperada | B25 | — | D19 — consola de clubs |
| `enums:jobTrigger.SCHEDULE` | programada | B25 | — | D19 — consola de clubs |

## D9 — comunicats i plantilles d'avís

| Clau | Text (ca) | Font | Registre | També a |
|---|---|---|---|---|
| `admin-census:member.feedback.preferences` | Les preferències d'avisos s'han desat. | B25 | — |  |
| `admin-census:member.preferences.alwaysOn` | Sempre actiu a l'app | B25 | — |  |
| `admin-census:member.preferences.loadError` | No s'han pogut carregar les preferències d'avisos. | B25 | — |  |
| `admin-census:member.preferences.loading` | Carregant les preferències d'avisos | B25 | — |  |
| `admin-census:member.preferences.sentLink` | Avisos enviats › | B25 | — |  |
| `admin-messaging:log.caption` | Avisos enviats pel club | B25 | — |  |
| `admin-messaging:log.column.readAt` | Llegida | B25 | — |  |
| `admin-messaging:log.column.recipient` | Destinatari | B25 | — |  |
| `admin-messaging:log.detail.attempts` | Intents | B25 | — |  |
| `admin-messaging:log.detail.deliveries` | Entregues | B25 | — |  |
| `admin-messaging:log.detail.direct` | Enviament directe | B25 | — |  |
| `admin-messaging:log.detail.event` | Esdeveniment | B25 | — |  |
| `admin-messaging:log.detail.lastError` | Darrer error | B25 | — |  |
| `admin-messaging:log.detail.loading` | Carregant l'avís | B25 | — |  |
| `admin-messaging:log.detail.noDeliveries` | Sense entregues externes | B25 | — |  |
| `admin-messaging:log.detail.productText` | Text del producte | B25 | — |  |
| `admin-messaging:log.detail.providerRef` | Referència del proveïdor | B25 | — |  |
| `admin-messaging:log.detail.readAt` | Llegida | B25 | — |  |
| `admin-messaging:log.detail.recipient` | Destinatari | B25 | — |  |
| `admin-messaging:log.detail.target` | Destí | B25 | — |  |
| `admin-messaging:log.empty` | Cap avís | B25 | — |  |
| `admin-messaging:log.emptyDescription` | Canvia els filtres o la cerca per veure'n més. | B25 | — |  |
| `admin-messaging:log.error` | No s'han pogut carregar els avisos. | B25 | — |  |
| `admin-messaging:log.filter.status` | Estat de l'entrega | B25 | — |  |
| `admin-messaging:log.link` | Avisos enviats › | B25 | — |  |
| `admin-messaging:log.search` | Cerca per codi o destinatari | B25 | — |  |
| `admin-messaging:log.selectRow` | Selecciona l'avís de {name} | B25 | — |  |
| `admin-messaging:log.title` | Avisos enviats | B25 | — |  |
| `admin-messaging:matrix.footnote` | L'SMS només és actiu a les plantilles de «Canvis en reserves fets pel club» · WhatsApp: només manual (wa.me) | B25 | — |  |
| `admin-messaging:matrix.notAvailable` | {cell}: no disponible | B25 | — |  |
| `admin-messaging:matrix.pushOff` | {audience}: sense push | B25 | — |  |
| `admin-messaging:matrix.pushOn` | {audience}: amb push | B25 | — |  |
| `admin-messaging:preview.emailFrame` | Correu de la vista prèvia | B25 | — |  |
| `admin-messaging:preview.error` | No s'ha pogut preparar la vista prèvia. | B25 | — |  |
| `admin-messaging:preview.loading` | Carregant la vista prèvia | B25 | — |  |
| `admin-messaging:preview.locales` | Idiomes de la vista prèvia | B25 | — |  |
| `admin-messaging:preview.sending` | Enviant | B25 | — |  |
| `admin-messaging:preview.sendTest` | Envia'm una prova | B25 | — |  |
| `admin-messaging:preview.smsMeta` | {length} caràcters · {segments, plural, one {# segment} other {# segments}} | B25 | — |  |
| `admin-messaging:preview.testSent` | T'hem enviat la prova | B25 | — |  |
| `admin-messaging:preview.truncated` | S'escurçarà amb … | B25 | — |  |
| `admin-messaging:preview.warnings` | Avisos de la vista prèvia | B25 | — |  |
| `admin-messaging:send.allMembers` | Tots els abonats | B25 | — |  |
| `admin-messaging:send.confirm` | Confirmo que vull enviar aquest comunicat a {count, plural, one {# abonat} other {# abonats}} | B25 | — |  |
| `admin-messaging:send.countError` | No s'han pogut comptar els destinataris. | B25 | — |  |
| `admin-messaging:send.counting` | Comptant els destinataris | B25 | — |  |
| `admin-messaging:send.done` | Comunicat enviat a {count, plural, one {# abonat} other {# abonats}} | B25 | — |  |
| `admin-messaging:send.error` | No s'ha pogut enviar el comunicat. Torna-ho a provar. | B25 | — |  |
| `admin-messaging:send.filters` | Els abonats dels filtres del llistat | B25 | — |  |
| `admin-messaging:send.loadError` | No s'han pogut carregar les plantilles. | B25 | — |  |
| `admin-messaging:send.loading` | Carregant les plantilles | B25 | — |  |
| `admin-messaging:send.noTemplates` | No hi ha cap plantilla que es pugui enviar. | B25 | — |  |
| `admin-messaging:send.recipients` | S'enviarà a {count, plural, one {# abonat} other {# abonats}} | B25 | — |  |
| `admin-messaging:send.selection` | {count, plural, one {# abonat seleccionat} other {# abonats seleccionats}} | B25 | — |  |
| `admin-messaging:send.sending` | Enviant | B25 | — |  |
| `admin-messaging:templates.choose` | Tria una plantilla | B25 | — |  |
| `admin-messaging:templates.chooseDescription` | Obre una plantilla de la llista per editar-ne el text, la icona i els canals. | B25 | — |  |
| `admin-messaging:templates.deleteConfirm` | Vols eliminar aquesta plantilla? | B25 | — |  |
| `admin-messaging:templates.editorLabel` | Editor de la plantilla | B25 | — |  |
| `admin-messaging:templates.empty` | No hi ha cap plantilla en aquesta categoria. | B25 | — |  |
| `admin-messaging:templates.genericError` | No s'ha pogut desar la plantilla. Torna-ho a provar. | B25 | — |  |
| `admin-messaging:templates.insertVariable` | Insereix [[{label}]] | B25 | — |  |
| `admin-messaging:templates.loadError` | No s'han pogut carregar les plantilles. | B25 | — |  |
| `admin-messaging:templates.loading` | Carregant les plantilles | B25 | — |  |
| `admin-messaging:templates.localeLabel` | Idioma del text | B25 | — |  |
| `admin-messaging:templates.missingVariables` | Falta la variable {vars} al text | B25 | — |  |
| `admin-messaging:templates.reload` | Recarrega | B25 | — |  |
| `admin-messaging:templates.reset` | Restaura el text per defecte | B25 | — |  |
| `admin-messaging:templates.resetConfirm` | Vols restaurar el text per defecte d'aquesta plantilla? | B25 | — |  |
| `admin-messaging:templates.saving` | Desant | B25 | — |  |
| `admin-messaging:templates.smsBody` | SMS (text curt) | B25 | — |  |
| `admin-messaging:templates.staffNote` | Els textos per a instructors i administració són del producte i no s'editen | B25 | — |  |
| `admin-messaging:templates.stale` | Algú ha modificat aquesta plantilla; recarrega-la | B25 | — |  |
| `admin-messaging:templates.unsaved` | sense desar | B25 | — |  |
| `enums:deliveryStatus.DELIVERED` | lliurat | B25 | — |  |
| `enums:deliveryStatus.FAILED` | fallit | B25 | — |  |
| `enums:deliveryStatus.QUEUED` | en cua | B25 | — |  |
| `enums:deliveryStatus.SENT` | enviat | B25 | — |  |
| `enums:deliveryStatus.SKIPPED_BY_PREFERENCE` | omès per preferència | B25 | — |  |
| `enums:deliveryStatus.SKIPPED_CAP` | límit d'SMS | B25 | — |  |
| `enums:deliveryStatus.SKIPPED_MODULE_OFF` | mòdul desactivat | B25 | — |  |
| `enums:deliveryStatus.SKIPPED_NO_CONTACT` | sense contacte | B25 | — |  |
| `enums:deliveryStatus.SKIPPED_NOT_ALLOWED` | no permès | B25 | — |  |
| `enums:deliveryStatus.SKIPPED_STALE` | ja no calia | B25 | — |  |
| `enums:notificationAudience.APPLICANT` | Sol·licitant | B25 | — |  |
| `enums:templateColor.NEUTRAL` | Neutre | B25 | — |  |
| `enums:templateColor.OK` | Correcte | B25 | — |  |
| `enums:templateIcon.bell` | Campana | B25 | — |  |
| `enums:templateIcon.check` | Validat | B25 | — |  |
| `enums:templateIcon.flag` | Bandera | B25 | — |  |
| `enums:templateIcon.lock` | Cadenat | B25 | — |  |
| `enums:templateIcon.paw` | Petja | B25 | — |  |
| `enums:templateIcon.unlock` | Cadenat obert | B25 | — |  |
| `enums:templateIcon.up` | Amunt | B25 | — |  |
| `enums:templateIcon.x` | Creu | B25 | — |  |
| `enums:templateStatus.DISABLED` | desactivada | B25 | — |  |

## D12 · D13 — agenda i fitxa d'alumne

| Clau | Text (ca) | Font | Registre | També a |
|---|---|---|---|---|
| `courses:blocks.agendaTitle` | Recorreguts muntats a les pistes | B25 | — |  |
| `courses:blocks.openCourse` | Obre el recorregut | B25 | — |  |
| `instructor:agenda.empty` | Aquesta setmana no hi ha res a l'agenda | B25 | — |  |
| `instructor:agenda.emptyDescription` | Prova una altra setmana o treu els filtres. | B25 | — |  |
| `instructor:agenda.filters` | Filtres de l'agenda | B25 | — |  |
| `instructor:agenda.gridLabel` | Agenda de la setmana del {range} | B25 | — |  |
| `instructor:agenda.loadError` | No s'ha pogut carregar l'agenda. | B25 | — |  |
| `instructor:agenda.loading` | Carregant l'agenda | B25 | — |  |
| `instructor:agenda.pdfBusy` | Generant el PDF | B25 | — |  |
| `instructor:agenda.previousWeek` | Setmana anterior | B25 | — |  |
| `instructor:agenda.ringLabel` | Filtre de pista | B25 | — |  |
| `instructor:agenda.sheetLoadError` | No s'ha pogut carregar la llista. | B25 | — |  |
| `instructor:agenda.sheetLoading` | Carregant la llista | B25 | — |  |
| `instructor:card.attendanceSub` | {noShow, plural, one {# no presentat} other {# no presentats}} · {notified, plural, one {# avisat} other {# avisats}} | B25 | — |  |
| `instructor:card.memberStatus` | {gender, select, FEMALE {Abonada} OTHER {Abonat/ada} other {Abonat}} | B25 | — |  |
| `instructor:card.noTasks` | Encara no hi ha cap tasca | B25 | — |  |
| `instructor:tasks.loadError` | No s'han pogut carregar les tasques. | B25 | — | Paquets compartits (transversal) |

## D14 — seguiment d'alumnes

| Clau | Text (ca) | Font | Registre | També a |
|---|---|---|---|---|
| `admin-census:followup.author.member` | {name} ({gender, select, FEMALE {alumna} OTHER {alumne/a} other {alumne}}) | B25 | — |  |
| `admin-census:followup.caption` | Tasques i notes d'alumnes, les no llegides primer | B25 | — |  |
| `admin-census:followup.columns.unread` | Pendent de llegir | B25 | — |  |
| `admin-census:followup.emptyDescription` | Les tasques dels instructors i les notes dels alumnes arribaran aquí. | B25 | — |  |
| `admin-census:followup.emptyTitle` | No hi ha res al seguiment | B25 | — |  |
| `admin-census:followup.error` | No s'ha pogut carregar el seguiment. | B25 | — |  |
| `admin-census:followup.kinds` | Què es mostra | B25 | — |  |
| `admin-census:followup.readFailed` | No s'ha pogut marcar com a llegit el seguiment de {name}. | B25 | — |  |
| `admin-census:followup.readingAll` | Marcant-ho tot com a llegit | B25 | — |  |
| `admin-census:followup.readOffline` | No hi ha connexió amb el servidor. | B25 | — |  |
| `admin-census:followup.search` | Cerca al seguiment | B25 | — |  |
| `admin-census:followup.unread` | {count, plural, one {# pendent de llegir} other {# pendents de llegir}} | B25 | — |  |
| `enums:followupKind.MEMBER_NOTE` | nota d'alumne | B25 | — |  |

## Entrenaments i bloquejos de pista (backoffice)

| Clau | Text (ca) | Font | Registre | També a |
|---|---|---|---|---|
| `admin-training:blocks.cancel` | Anul·la el bloqueig | B24 | — |  |
| `admin-training:blocks.cancelLabel` | Anul·la el bloqueig de {when} | B24 | — |  |
| `admin-training:blocks.cancelled` | Bloqueig anul·lat. | B24 | — |  |
| `admin-training:blocks.cancelling` | Anul·lant el bloqueig… | B24 | — |  |
| `admin-training:blocks.caption` | Bloquejos i reserves de pista | B24 | — |  |
| `admin-training:blocks.columns.createdBy` | Creat per | B24 | — |  |
| `admin-training:blocks.emptyTitle` | Cap bloqueig ni reserva de pista | B24 | — |  |
| `admin-training:blocks.inactiveRing` | pista desactivada | B24 | — |  |
| `admin-training:blocks.search` | Cerca per pista o nota | B24 | — |  |
| `admin-training:blocks.statusLabel` | Estat del bloqueig | B24 | — |  |
| `admin-training:bookings.columns.origin` | Origen | B24 | — |  |
| `admin-training:bookings.emptyTitle` | Cap reserva d'entrenament | B24 | — |  |
| `admin-training:bookings.search` | Cerca per abonat, gos o pista | B24 | — |  |
| `admin-training:bookings.statusLabel` | Estat de la reserva | B24 | — |  |
| `admin-training:list.dismiss` | Tanca l'avís | B24 | — |  |
| `admin-training:list.emptyDescription` | Canvia els filtres o la cerca per veure'n més. | B24 | — |  |
| `admin-training:list.error` | No s'ha pogut carregar el llistat. | B24 | — |  |
| `admin-training:tab.blocks` | Bloquejos i reserves de pista | B24 | — |  |
| `enums:ringBlockState.CANCELLED` | anul·lat | B24 | — |  |
| `instructor:ringBlock.card.when` | Dia i hores | B24 | — |  |

## D18 — recorreguts

| Clau | Text (ca) | Font | Registre | També a |
|---|---|---|---|---|
| `admin-courses:common.loading` | Carregant | B24 | — |  |
| `admin-courses:common.saving` | Desant | B24 | — |  |
| `admin-courses:controls.flipHorizontal` | Mirall horitzontal | B24 | — |  |
| `admin-courses:controls.flipVertical` | Mirall vertical | B24 | — |  |
| `admin-courses:controls.nudgeDown` | Mou avall | B24 | — |  |
| `admin-courses:controls.nudgeLeft` | Mou a l'esquerra | B24 | — |  |
| `admin-courses:controls.nudgeRight` | Mou a la dreta | B24 | — |  |
| `admin-courses:controls.nudgeUp` | Mou amunt | B24 | — |  |
| `admin-courses:controls.reset` | Torna a l'inici | B24 | — |  |
| `admin-courses:controls.rotateFineLeft` | Gira 1° a l'esquerra | B24 | — |  |
| `admin-courses:controls.rotateFineRight` | Gira 1° a la dreta | B24 | — |  |
| `admin-courses:controls.rotateLeft` | Gira 90° a l'esquerra | B24 | — |  |
| `admin-courses:controls.rotateRight` | Gira 90° a la dreta | B24 | — |  |
| `admin-courses:controls.title` | Col·locació | B24 | — |  |
| `admin-courses:detail.back` | ‹ Biblioteca de recorreguts | B24 | — |  |
| `admin-courses:detail.buildSheet` | Full de muntatge | B24 | — |  |
| `admin-courses:detail.copy` | Copia al club | B24 | — |  |
| `admin-courses:detail.copyQuestion` | Vols copiar «{name}» als recorreguts del club? La còpia no es posarà al dia si l'original canvia. | B24 | — |  |
| `admin-courses:detail.deleteQuestion` | Vols eliminar «{name}»? Deixarà de sortir a la biblioteca. | B24 | — |  |
| `admin-courses:detail.duplicateQuestion` | Vols fer una còpia de «{name}»? | B24 | — |  |
| `admin-courses:detail.image` | Plànol de {name} | B24 | — |  |
| `admin-courses:detail.libraryReadOnly` | Aquest recorregut és de la biblioteca d'AgilityHub: copia'l al club per editar-lo o col·locar-lo. | B24 | — |  |
| `admin-courses:detail.loadError` | Torna-ho a provar d'aquí a una estona. | B24 | — |  |
| `admin-courses:detail.loadErrorTitle` | No s'ha pogut obrir el recorregut | B24 | — |  |
| `admin-courses:detail.metadata` | Dades del recorregut | B24 | aprovat (A39.70) |  |
| `admin-courses:detail.nameRequired` | Posa un nom al recorregut. | B24 | — |  |
| `admin-courses:detail.noModel` | Aquest recorregut no té plànol per mostrar. | B24 | — |  |
| `admin-courses:detail.noPlacements` | Encara no s'ha col·locat en cap pista. | B24 | — |  |
| `admin-courses:detail.place` | Col·loca en una pista | B24 | — |  |
| `admin-courses:detail.placementLine` | {ring} · desada {date} | B24 | — |  |
| `admin-courses:detail.placements` | Col·locacions | B24 | — |  |
| `admin-courses:detail.plan2d` | Plànol de {name} | B24 | — |  |
| `admin-courses:detail.plan3d` | {name} en 3D | B24 | — |  |
| `admin-courses:detail.register` | Registra-ho com a muntat | B24 | — |  |
| `admin-courses:detail.saved` | Canvis desats. | B24 | — |  |
| `admin-courses:detail.share` | Comparteix amb el club | B24 | — |  |
| `admin-courses:detail.shareStale` | Algú ha canviat el recorregut mentrestant. L'hem tornat a carregar: torna a triar si el comparteixes. | B24 | — |  |
| `admin-courses:detail.sheetPending` | Preparant el full de muntatge | B24 | — |  |
| `admin-courses:detail.sheetStale` | La geometria de la pista ha canviat: revisa la col·locació abans de treure'n el full de muntatge. | B24 | aprovat (A39.111) |  |
| `admin-courses:detail.stale` | Algú ha canviat el recorregut mentrestant. L'hem tornat a carregar amb els teus canvis a sobre: revisa'ls i desa de nou. | B24 | aprovat (A39.109) |  |
| `admin-courses:detail.storedSheet` | Full desat | B24 | aprovat (A39.110) |  |
| `admin-courses:detail.tab2d` | Plànol | B24 | — |  |
| `admin-courses:detail.viewer` | Recorregut | B24 | — |  |
| `admin-courses:doors.add` | Afegeix una porta | B24 | — |  |
| `admin-courses:doors.clearance` | Marge (m) | B24 | — |  |
| `admin-courses:doors.clearanceFor` | Marge de la porta {index} | B24 | — |  |
| `admin-courses:doors.description` | Les portes per on s'entra i se surt de la pista. Els avisos de col·locació en mantenen el marge. | B24 | — |  |
| `admin-courses:doors.empty` | Encara no hi ha cap porta. En pots afegir fins a {maximum}. | B24 | — |  |
| `admin-courses:doors.end` | Fins a (m) | B24 | — |  |
| `admin-courses:doors.endFor` | Final de la porta {index} | B24 | — |  |
| `admin-courses:doors.flow` | Sentit | B24 | — |  |
| `admin-courses:doors.flowFor` | Sentit de la porta {index} | B24 | — |  |
| `admin-courses:doors.geometry` | {hint}: {wall} m de costat, {opening} m d'obertura | B24 | — |  |
| `admin-courses:doors.geometryWall` | {hint}: {wall} m de costat | B24 | — |  |
| `admin-courses:doors.maximumReached` | Ja hi ha {maximum} portes, el màxim. | B24 | — |  |
| `admin-courses:doors.notesFor` | Notes de la porta {index} | B24 | — |  |
| `admin-courses:doors.previewAria` | Portes de {name} | B24 | — |  |
| `admin-courses:doors.remove` | Treu la porta {index} | B24 | — |  |
| `admin-courses:doors.revert` | Desfés | B24 | — |  |
| `admin-courses:doors.save` | Desa les portes | B24 | — |  |
| `admin-courses:doors.saved` | Portes desades. | B24 | — |  |
| `admin-courses:doors.sideHint.east` | costat est | B24 | — |  |
| `admin-courses:doors.sideHint.north` | costat nord | B24 | — |  |
| `admin-courses:doors.sideHint.south` | costat sud | B24 | — |  |
| `admin-courses:doors.sideHint.west` | costat oest | B24 | — |  |
| `admin-courses:doors.start` | Des de (m) | B24 | — |  |
| `admin-courses:doors.startFor` | Inici de la porta {index} | B24 | — |  |
| `admin-courses:doors.title` | Portes de {name} ({count}/{maximum}) | B24 | — |  |
| `admin-courses:doors.validation.clearance` | {door}: el marge no pot ser negatiu. | B24 | — |  |
| `admin-courses:doors.validation.endpoints` | {door}: indica on comença i on acaba. | B24 | — |  |
| `admin-courses:doors.validation.maximum` | Hi ha {count} portes: el màxim és {maximum}. | B24 | — |  |
| `admin-courses:doors.validation.order` | {door}: l'inici ({start} m) ha de ser abans del final ({end} m). | B24 | — |  |
| `admin-courses:doors.validation.wall` | {door}: acaba a {end} m i el costat en fa {wall}. | B24 | — |  |
| `admin-courses:doors.wall` | Costat | B24 | — |  |
| `admin-courses:doors.wallFor` | Costat de la porta {index} | B24 | — |  |
| `admin-courses:editor.blockedBy` | Avisos crítics | B24 | aprovat (A39.107) |  |
| `admin-courses:editor.courseStale` | El recorregut ha canviat mentrestant. L'hem tornat a carregar amb la teva posició: revisa els avisos i desa de nou. | B24 | — |  |
| `admin-courses:editor.criticalAdmin` | {count, plural, one {Hi ha # avís crític.} other {Hi ha # avisos crítics.}} Pots desar-la igualment, si cal. | B24 | aprovat (A39.103) |  |
| `admin-courses:editor.criticalInstructor` | {count, plural, one {Hi ha # avís crític.} other {Hi ha # avisos crítics.}} Corregeix-los abans de desar-la. | B24 | aprovat (A39.104) |  |
| `admin-courses:editor.dragHint` | Arrossega el plànol per moure el recorregut, o fes servir els controls. | B24 | — |  |
| `admin-courses:editor.force` | Desa igualment | B24 | — |  |
| `admin-courses:editor.forceAdminOnly` | Només un administrador pot desar una col·locació amb avisos crítics. | B24 | aprovat (A39.106) |  |
| `admin-courses:editor.forceQuestion` | Vols desar-la igualment? Quedarà registrat que l'has desada amb avisos crítics. | B24 | aprovat (A39.105) |  |
| `admin-courses:editor.loadError` | Torna-ho a provar d'aquí a una estona. | B24 | — |  |
| `admin-courses:editor.loadErrorTitle` | No s'ha pogut obrir l'editor | B24 | — |  |
| `admin-courses:editor.name` | Nom de la col·locació | B24 | — |  |
| `admin-courses:editor.namePlaceholder` | p. ex. Dijous tarda | B24 | — |  |
| `admin-courses:editor.noRings` | Per col·locar un recorregut, primer cal la geometria d'una pista (Configuració › Pistes). | B24 | — |  |
| `admin-courses:editor.noRingsTitle` | Cap pista amb geometria | B24 | — |  |
| `admin-courses:editor.noWarnings` | Cap avís: el recorregut hi cap bé. | B24 | aprovat (A39.102) |  |
| `admin-courses:editor.plan` | Plànol a la pista | B24 | — |  |
| `admin-courses:editor.planLabel` | Recorregut col·locat a {ring} | B24 | — |  |
| `admin-courses:editor.ringFixed` | Una col·locació desada es queda a la seva pista. | B24 | — |  |
| `admin-courses:editor.ringHelp` | Només hi surten les pistes amb geometria. | B24 | — |  |
| `admin-courses:editor.save` | DESA LA COL·LOCACIÓ | B24 | — |  |
| `admin-courses:editor.saved` | Col·locació desada. | B24 | — |  |
| `admin-courses:editor.sheetStale` | La geometria de la pista ha canviat: desa la col·locació per poder treure'n el full de muntatge. | B24 | — |  |
| `admin-courses:editor.stale` | Algú ha desat aquesta col·locació mentrestant. Hem mantingut la teva posició: desa de nou per substituir-la. | B24 | aprovat (A39.108) |  |
| `admin-courses:editor.staleHint` | La geometria de la pista ha canviat des que es va desar: revisa la col·locació i desa-la de nou. | B24 | — |  |
| `admin-courses:editor.title` | Col·locació a la pista | B24 | — |  |
| `admin-courses:editor.warnings` | {count, plural, =0 {Cap avís} one {# avís} other {# avisos}} | B24 | — |  |
| `admin-courses:fields.agilityhubLevel` | Nivell orientatiu | B24 | aprovat (A39.73) |  |
| `admin-courses:fields.discipline` | Disciplina | B24 | — |  |
| `admin-courses:fields.tags` | Etiquetes | B24 | — |  |
| `admin-courses:fields.tagsHelp` | Separades per comes. | B24 | — |  |
| `admin-courses:files.fallback` | recorregut | B24 | — |  |
| `admin-courses:files.markerSheet` | marcadors-{ring}.pdf | B24 | — |  |
| `admin-courses:geometry.addMarker` | Afegeix un marcador | B24 | — |  |
| `admin-courses:geometry.addZone` | Afegeix una zona | B24 | — |  |
| `admin-courses:geometry.back` | ‹ Pistes | B24 | — |  |
| `admin-courses:geometry.borderClearance` | Marge a la tanca (m) | B24 | aprovat (A39.71) |  |
| `admin-courses:geometry.create` | Afegeix la geometria | B24 | — |  |
| `admin-courses:geometry.diagram` | Marcadors de {ring} | B24 | — |  |
| `admin-courses:geometry.doorNamed` | Porta «{label}» | B24 | — |  |
| `admin-courses:geometry.heading` | Geometria · {ring} | B24 | — |  |
| `admin-courses:geometry.length` | Llargada (m) | B24 | — |  |
| `admin-courses:geometry.loadError` | No s'ha pogut carregar la pista | B24 | — |  |
| `admin-courses:geometry.markerLabel` | Nom del marcador {index} | B24 | — |  |
| `admin-courses:geometry.markerNamed` | Marcador {label} | B24 | — |  |
| `admin-courses:geometry.markers` | Marcadors de calibratge | B24 | — |  |
| `admin-courses:geometry.markerSheet` | Full de marcadors | B24 | — |  |
| `admin-courses:geometry.markerSheetNoMarker` | Cap marcador actiu: activa'n almenys un per treure el full. | B24 | — |  |
| `admin-courses:geometry.markerSheetTooLarge` | {labels}: fan més de {mm, number} mm i no caben a la pàgina a mida real. | B24 | — |  |
| `admin-courses:geometry.markersHelp` | Posició en metres des de la cantonada inferior esquerra: x al llarg de la pista, y a l'ample. | B24 | — |  |
| `admin-courses:geometry.markerX` | x del marcador {label} (m) | B24 | — |  |
| `admin-courses:geometry.markerY` | y del marcador {label} (m) | B24 | — |  |
| `admin-courses:geometry.none` | Aquesta pista no té geometria: només s'hi poden registrar muntatges amb foto o plànol. | B24 | — |  |
| `admin-courses:geometry.notANumber` | ha de ser un número | B24 | — |  |
| `admin-courses:geometry.orientation` | Orientació (°) | B24 | — |  |
| `admin-courses:geometry.orientationHelp` | Graus respecte al nord. | B24 | — |  |
| `admin-courses:geometry.otherField` | Un altre camp | B24 | — |  |
| `admin-courses:geometry.precheck` | Revisa aquests camps abans de desar: | B24 | — |  |
| `admin-courses:geometry.removeMarker` | Treu el marcador {label} | B24 | — |  |
| `admin-courses:geometry.removeZone` | Treu la zona {label} | B24 | — |  |
| `admin-courses:geometry.rule.COLLINEAR_MARKERS` | els marcadors actius no poden estar en línia recta | B24 | — |  |
| `admin-courses:geometry.rule.DUPLICATE_APRIL_TAG` | hi ha dos marcadors amb el mateix codi AprilTag | B24 | — |  |
| `admin-courses:geometry.rule.DUPLICATE_ID` | està repetit | B24 | — |  |
| `admin-courses:geometry.rule.DUPLICATE_LABEL` | hi ha dos marcadors amb el mateix nom | B24 | — |  |
| `admin-courses:geometry.rule.DUPLICATE_MARKER_UID` | hi ha dos marcadors amb el mateix identificador | B24 | — |  |
| `admin-courses:geometry.rule.NEGATIVE` | no pot ser negatiu | B24 | — |  |
| `admin-courses:geometry.rule.NOT_POSITIVE` | ha de ser més gran que zero | B24 | — |  |
| `admin-courses:geometry.rule.NOT_SIMPLE` | no pot creuar-se | B24 | — |  |
| `admin-courses:geometry.rule.other` | no és vàlid | B24 | — |  |
| `admin-courses:geometry.rule.OUT_OF_RANGE` | ha de ser entre 10 i 60 m | B24 | — |  |
| `admin-courses:geometry.rule.OUTSIDE_PERIMETER` | ha de quedar dins del perímetre | B24 | — |  |
| `admin-courses:geometry.rule.OUTSIDE_RING` | ha de quedar dins de la pista | B24 | — |  |
| `admin-courses:geometry.rule.TOO_FEW_MARKERS` | calen almenys tres marcadors actius | B24 | — |  |
| `admin-courses:geometry.rule.TOO_FEW_POINTS` | necessita almenys tres punts | B24 | — |  |
| `admin-courses:geometry.rule.TOO_MANY_MARKERS` | hi ha massa marcadors actius | B24 | — |  |
| `admin-courses:geometry.saved` | Geometria desada. | B24 | — |  |
| `admin-courses:geometry.stale` | Algú ha canviat la geometria mentrestant. L'hem tornada a carregar amb els teus canvis a sobre: revisa'ls i desa de nou. | B24 | — |  |
| `admin-courses:geometry.surface` | Superfície | B24 | — |  |
| `admin-courses:geometry.title` | Geometria del ring | B24 | — |  |
| `admin-courses:geometry.width` | Amplada (m) | B24 | — |  |
| `admin-courses:geometry.zone.depth` | Amplada de {label} (m) | B24 | — |  |
| `admin-courses:geometry.zone.margin` | Marge d'avís de {label} (m) | B24 | aprovat (A39.72) |  |
| `admin-courses:geometry.zone.width` | Llargada de {label} (m) | B24 | — |  |
| `admin-courses:geometry.zone.y` | y de {label} (m) | B24 | — |  |
| `admin-courses:geometry.zoneLabel` | Nom de la zona | B24 | — |  |
| `admin-courses:geometry.zoneNamed` | Zona «{label}» | B24 | — |  |
| `admin-courses:geometry.zones` | Zones no-go | B24 | — |  |
| `admin-courses:geometry.zonesHelp` | Rectangles on no es pot posar cap obstacle: cantonada inferior esquerra, mida i marge d'avís, en metres. | B24 | — |  |
| `admin-courses:image.file` | Plànol o foto | B24 | — |  |
| `admin-courses:image.fileHelp` | Una imatge (JPG, PNG…) del recorregut muntat o dibuixat. | B24 | — |  |
| `admin-courses:image.fileRequired` | Tria la imatge del recorregut. | B24 | — |  |
| `admin-courses:image.nameRequired` | Posa un nom al recorregut. | B24 | — |  |
| `admin-courses:image.submit` | Desa el recorregut | B24 | — |  |
| `admin-courses:image.title` | Puja un plànol o foto | B24 | — |  |
| `admin-courses:import.file` | Tria el fitxer .txt que exporta Smarter | B24 | — |  |
| `admin-courses:import.heading` | Fitxer de Smarter Agility | B24 | — |  |
| `admin-courses:import.ignoredLogos` | {count, plural, one {# logotip ignorat} other {# logotips ignorats}} | B24 | — |  |
| `admin-courses:import.noGoZones` | {count, plural, one {# zona no-go} other {# zones no-go}} | B24 | — |  |
| `admin-courses:import.parseError` | No s'ha pogut llegir el fitxer. Comprova que és l'exportació en text de Smarter. | B24 | — |  |
| `admin-courses:import.parsing` | Llegint {filename}… | B24 | — |  |
| `admin-courses:import.save` | Desa el recorregut | B24 | — |  |
| `admin-courses:import.saved` | Recorregut desat | B24 | — |  |
| `admin-courses:import.saving` | Desant el recorregut | B24 | — |  |
| `admin-courses:import.title` | Importa un fitxer Smarter | B24 | — |  |
| `admin-courses:import.units` | Unitats: {value} | B24 | — |  |
| `admin-courses:inventory.decrease` | {name}: un menys | B24 | — |  |
| `admin-courses:inventory.description` | El material de la pista. Si la pista no en té, compta el del club. | B24 | — |  |
| `admin-courses:inventory.increase` | {name}: un més | B24 | — |  |
| `admin-courses:inventory.quantity` | Quantitat de {name} | B24 | — |  |
| `admin-courses:inventory.revert` | Desfés | B24 | — |  |
| `admin-courses:inventory.save` | Desa l'inventari | B24 | — |  |
| `admin-courses:inventory.saved` | Inventari desat. | B24 | — |  |
| `admin-courses:inventory.title` | Inventari de {name}: {total, plural, one {# obstacle} other {# obstacles}} de {types, plural, one {# tipus} other {# tipus}} | B24 | — |  |
| `admin-courses:list.caption` | Llistat de recorreguts | B24 | — |  |
| `admin-courses:list.columns.activeOnRings` | Muntat a | B24 | — |  |
| `admin-courses:list.columns.agilityhubLevel` | Nivell AgilityHub | B24 | — |  |
| `admin-courses:list.columns.discipline` | Disciplina | B24 | — |  |
| `admin-courses:list.columns.levelId` | Nivell del club | B24 | — |  |
| `admin-courses:list.columns.name` | Recorregut | B24 | — |  |
| `admin-courses:list.columns.obstacleCount` | Nombre d'obstacles | B24 | — |  |
| `admin-courses:list.description` | Els recorreguts del club, la biblioteca d'AgilityHub i els teus. | B24 | — |  |
| `admin-courses:list.empty` | Encara no hi ha cap recorregut. Importa'n un de Smarter o dibuixa'n un. | B24 | — |  |
| `admin-courses:list.emptyFiltered` | Treu algun filtre per veure'n més. | B24 | — |  |
| `admin-courses:list.emptyFilteredTitle` | Cap recorregut amb aquests filtres | B24 | — |  |
| `admin-courses:list.emptyTitle` | Encara no hi ha cap recorregut | B24 | — |  |
| `admin-courses:list.error` | No s'han pogut carregar els recorreguts. | B24 | — |  |
| `admin-courses:list.libraryHint` | Obre un recorregut d'AgilityHub per copiar-lo al club. | B24 | — |  |
| `admin-courses:list.new` | Nou recorregut | B24 | — |  |
| `admin-courses:list.newCopy` | Copia d'AgilityHub | B24 | — |  |
| `admin-courses:list.newImage` | Puja un plànol o foto | B24 | — |  |
| `admin-courses:list.newSmarter` | Importa un fitxer Smarter (.txt) | B24 | — |  |
| `admin-courses:list.owner.AGILITYHUB` | AgilityHub | B24 | — |  |
| `admin-courses:list.ownerLabel` | Recorreguts que es mostren | B24 | — |  |
| `admin-courses:list.ownerType.AGILITYHUB` | AgilityHub | B24 | — |  |
| `admin-courses:list.search` | Cerca un recorregut | B24 | — |  |
| `admin-courses:list.title` | Biblioteca de recorreguts | B24 | — |  |
| `admin-courses:markerSheet.identifiers` | {uid} · AprilTag 36h11 núm. {tag} | B24 | — |  |
| `admin-courses:markerSheet.instructions` | Imprimeix-lo a mida real, sense ajustar a la pàgina. Fixa'l pla i ben visible al punt de la pista que indica la posició, sense tapar el marge blanc. | B24 | — |  |
| `admin-courses:markerSheet.marker` | Marcador {label} | B24 | — |  |
| `admin-courses:markerSheet.position` | Posició a la pista: x {x} m · y {y} m | B24 | — |  |
| `admin-courses:markerSheet.size` | Mida impresa: {mm, number} mm (amb el marge blanc) | B24 | — |  |
| `admin-courses:markerSheet.title` | Full de marcadors · {ring} | B24 | — |  |
| `admin-courses:setup.instructorRefused` | En aquest club només l'administració pot registrar què hi ha muntat. | B24 | aprovat (A39.114) |  |
| `admin-courses:setup.kind` | Què hi ha muntat? | B24 | — |  |
| `admin-courses:setup.registered` | Registrat com a muntat a {ring}. | B24 | — |  |
| `admin-courses:setup.registeredReplacing` | Registrat com a muntat a {ring}; substitueix el muntatge anterior. | B24 | — |  |
| `admin-courses:setup.replaces` | Substituirà el muntatge actual ({kind}, de {day}). | B24 | — |  |
| `admin-courses:setup.title` | Registra-ho com a muntat | B24 | — |  |
| `admin-courses:setup.until` | Fins quan? | B24 | — |  |
| `admin-courses:setup.untilHelp` | Si ho deixes en blanc, es retira sol al cap dels dies que té configurats el club. | B24 | — |  |
| `admin-courses:setup.untilPast` | Tria avui o un dia posterior. | B24 | — |  |
| `admin-courses:setups.activeLine` | Muntat el {built} · fins al {until} | B24 | — |  |
| `admin-courses:setups.empty` | Encara no s'hi ha registrat cap muntatge. | B24 | — |  |
| `admin-courses:setups.replaced` | Substituït | B24 | aprovat (A39.113) |  |
| `admin-courses:setups.review` | Revisa-la | B24 | — |  |
| `admin-courses:setups.ringInactive` | Pista desactivada | B24 | — |  |
| `admin-courses:setups.title` | Muntatges | B24 | — |  |
| `admin-courses:severity.critical` | crític | B24 | — |  |
| `admin-courses:sheet.buildTitle` | Full de muntatge | B24 | — |  |
| `admin-courses:sheet.columns.heading` | Orientació | B24 | — |  |
| `admin-courses:sheet.columns.markers` | Distància als marcadors | B24 | — |  |
| `admin-courses:sheet.inventory` | Material necessari | B24 | — |  |
| `admin-courses:sheet.notStored` | S'ha descarregat el full de muntatge, però no s'ha pogut desar: {reason} | B24 | — |  |
| `admin-courses:sheet.plan` | Plànol | B24 | — |  |
| `admin-courses:stale` | Geometria canviada: revisa la col·locació | B24 | aprovat (A39.112) |  |
| `admin-courses:warnings.anObstacle` | Un obstacle | B24 | — |  |
| `admin-courses:warnings.borderClearance` | {obstacle} queda massa a prop de la tanca. | B24 | aprovat (A39.93) |  |
| `admin-courses:warnings.courseLarger` | El recorregut no hi cap, ni girat. | B24 | aprovat (A39.98) |  |
| `admin-courses:warnings.courseNoGo` | {obstacle} toca una zona no-go del recorregut. | B24 | aprovat (A39.94) |  |
| `admin-courses:warnings.doorBlocked` | {obstacle} tapa la porta «{door}». | B24 | aprovat (A39.96) |  |
| `admin-courses:warnings.doorClearance` | {obstacle} queda massa a prop de la porta «{door}». | B24 | aprovat (A39.97) |  |
| `admin-courses:warnings.inventoryNotConfigured` | La pista no té inventari: no es comprova el material. | B24 | aprovat (A39.99) |  |
| `admin-courses:warnings.inventoryShort` | Falta material: {count} × {type}. | B24 | aprovat (A39.101) |  |
| `admin-courses:warnings.inventoryUnknown` | {count, plural, one {# obstacle és} other {# obstacles són}} d'un tipus desconegut. | B24 | aprovat (A39.100) |  |
| `admin-courses:warnings.obstacle` | L'obstacle {numbers} ({type}) | B24 | aprovat (A39.91) |  |
| `admin-courses:warnings.obstacleUnnumbered` | Un obstacle sense número ({type}) | B24 | — |  |
| `admin-courses:warnings.outsideRing` | {obstacle} queda fora de la pista. | B24 | aprovat (A39.92) |  |
| `admin-courses:warnings.ringNoGo` | {obstacle} toca la zona «{zone}». | B24 | aprovat (A39.95) |  |
| `enums:courseSource.AGILITYHUB_COPY` | Còpia d'AgilityHub | B24 | aprovat (A39.155) |  |
| `enums:courseSource.IMAGE` | Plànol o foto | B24 | aprovat (A39.154) |  |
| `enums:courseSource.SMARTER` | Smarter | B24 | aprovat (A39.152) |  |
| `enums:doorFlow.BOTH` | entrada i sortida | B24 | — |  |
| `enums:doorSide.NORTH` | Nord | B24 | — |  |
| `enums:doorSide.SOUTH` | Sud | B24 | — |  |
| `enums:doorSide.WEST` | Oest | B24 | — |  |
| `enums:ringSurface.ARTIFICIAL` | Gespa artificial | B24 | — |  |
| `enums:ringSurface.GRASS` | Gespa | B24 | — |  |
| `enums:ringSurface.INDOOR` | Interior | B24 | — |  |

## D19 — consola de clubs

| Clau | Text (ca) | Font | Registre | També a |
|---|---|---|---|---|
| `admin-audit:actions.ACCESS_RESENT` | Accés reenviat | B24 | — | Auditoria |
| `admin-audit:actions.ACCOUNT_EMAIL_STATUS_CHANGED` | Estat del correu electrònic modificat | B24 | — | Auditoria |
| `admin-audit:actions.ACCOUNT_ERASED` | Dades del compte suprimides | B24 | — | Auditoria |
| `admin-audit:actions.ACTIVITY_CANCELLED` | Activitat anul·lada | B24 | — | Auditoria |
| `admin-audit:actions.ACTIVITY_PUBLISHED` | Activitat publicada | B24 | — | Auditoria |
| `admin-audit:actions.ACTIVITY_REGISTERED_BY_CLUB` | Inscripció a l'activitat feta pel club | B24 | — | Auditoria |
| `admin-audit:actions.ACTIVITY_REGISTRATION_CANCELLED_BY_CLUB` | Inscripció a l'activitat cancel·lada pel club | B24 | — | Auditoria |
| `admin-audit:actions.ACTIVITY_UPDATED` | Activitat modificada | B24 | — | Auditoria |
| `admin-audit:actions.ANNOUNCEMENT_SENT` | Comunicat enviat | B24 | — | Auditoria |
| `admin-audit:actions.ATTENDANCE_OVERRIDDEN` | Assistència corregida | B24 | — | Auditoria |
| `admin-audit:actions.BOOKING_BLOCK_CLEARED` | Bloqueig de reserves retirat | B24 | — | Auditoria |
| `admin-audit:actions.BOOKING_BLOCK_SET` | Reserves bloquejades | B24 | — | Auditoria |
| `admin-audit:actions.BOOKING_CANCELLED_BY_CLUB` | Reserva cancel·lada pel club | B24 | — | Auditoria |
| `admin-audit:actions.BOOKING_CANCELLED_LATE` | Reserva anul·lada tard | B24 | — | Auditoria |
| `admin-audit:actions.BOOKING_CREATED_BY_CLUB` | Reserva feta pel club | B24 | — | Auditoria |
| `admin-audit:actions.CARD_CHARGES_STARTED` | Cobraments amb targeta iniciats | B24 | — | Auditoria |
| `admin-audit:actions.CATALOG_CHANGED` | Catàleg modificat | B24 | — | Auditoria |
| `admin-audit:actions.CLASS_RISK_EXEMPTION_CHANGED` | Exempció de la revisió de risc modificada | B24 | — | Auditoria |
| `admin-audit:actions.CLASS_UPDATED_WITH_BOOKINGS` | Classe amb reserves modificada | B24 | — | Auditoria |
| `admin-audit:actions.CLUB_ADMIN_INVITED` | Administrador del club convidat | B24 | aprovat (A39.64) | Auditoria |
| `admin-audit:actions.CLUB_CREATED` | Club creat | B24 | aprovat (A39.58) | Auditoria |
| `admin-audit:actions.CLUB_DOMAIN_CHANGED` | Domini del club modificat | B24 | aprovat (A39.62) | Auditoria |
| `admin-audit:actions.CLUB_MODULES_CHANGED` | Mòduls del club modificats | B24 | aprovat (A39.61) | Auditoria |
| `admin-audit:actions.CLUB_PAYMENT_PROVIDER_CHANGED` | Proveïdor de pagament del club modificat | B24 | aprovat (A39.63) | Auditoria |
| `admin-audit:actions.CLUB_STATUS_CHANGED` | Estat del club modificat | B24 | aprovat (A39.60) | Auditoria |
| `admin-audit:actions.CLUB_UPDATED` | Dades del club modificades | B24 | aprovat (A39.59) | Auditoria |
| `admin-audit:actions.COURSE_FORCED_PLACEMENT` | Col·locació forçada del recorregut | B24 | — | Auditoria |
| `admin-audit:actions.DATA_EXPORTED` | Dades exportades | B24 | — | Auditoria |
| `admin-audit:actions.DOG_DEACTIVATED` | Gos donat de baixa | B24 | — | Auditoria |
| `admin-audit:actions.DOG_DOCUMENT_FILE_REMOVED` | Fitxer d'un document del gos retirat | B24 | — | Auditoria |
| `admin-audit:actions.DOG_FREE_TRAINING_CHANGED` | Dret d'entrenament lliure modificat | B24 | — | Auditoria |
| `admin-audit:actions.DOG_LEVEL_CHANGED` | Nivell del gos modificat | B24 | — | Auditoria |
| `admin-audit:actions.DOG_REACTIVATED` | Gos reactivat | B24 | — | Auditoria |
| `admin-audit:actions.DOG_TRANSFERRED` | Gos transferit | B24 | — | Auditoria |
| `admin-audit:actions.DOG_UPDATED` | Dades del gos modificades | B24 | — | Auditoria |
| `admin-audit:actions.ERASURE_CANCELLED` | Supressió de dades anul·lada | B24 | — | Auditoria |
| `admin-audit:actions.ERASURE_REQUESTED` | Supressió de dades sol·licitada | B24 | — | Auditoria |
| `admin-audit:actions.FAMILY_GROUP_CHANGED` | Grup familiar modificat | B24 | — | Auditoria |
| `admin-audit:actions.IMPERSONATION_STARTED` | Suplantació iniciada | B24 | — | Auditoria |
| `admin-audit:actions.INACTIVITY_RESOLVED` | Sol·licitud d'inactivitat resolta | B24 | — | Auditoria |
| `admin-audit:actions.INVOICE_CANCELLED` | Rebut anul·lat | B24 | — | Auditoria |
| `admin-audit:actions.INVOICE_CREATED_MANUAL` | Rebut manual creat | B24 | — | Auditoria |
| `admin-audit:actions.INVOICE_MARKED_FAILED` | Rebut marcat com a impagat | B24 | — | Auditoria |
| `admin-audit:actions.INVOICE_MARKED_PAID` | Rebut marcat com a cobrat | B24 | — | Auditoria |
| `admin-audit:actions.JOB_TRIGGERED` | Procés executat manualment | B24 | — | Auditoria |
| `admin-audit:actions.LEAVE_CANCELLED` | Baixa anul·lada | B24 | — | Auditoria |
| `admin-audit:actions.LEAVE_RESOLVED` | Sol·licitud de baixa resolta | B24 | — | Auditoria |
| `admin-audit:actions.MEMBER_CONSENT_CHANGED` | Consentiments modificats | B24 | — | Auditoria |
| `admin-audit:actions.MEMBER_DATA_EXPORTED` | Dades personals de l'abonat exportades | B24 | — | Auditoria |
| `admin-audit:actions.MEMBER_ERASED` | Dades de l'abonat suprimides | B24 | — | Auditoria |
| `admin-audit:actions.MEMBER_PAYMENT_METHOD_CHANGED` | Mètode de pagament modificat | B24 | — | Auditoria |
| `admin-audit:actions.MEMBER_PLAN_CHANGED` | Modalitat modificada | B24 | — | Auditoria |
| `admin-audit:actions.MEMBER_ROLES_CHANGED` | Rols d'accés modificats | B24 | — | Auditoria |
| `admin-audit:actions.MEMBER_STATUS_CHANGED` | Estat de l'abonat modificat | B24 | — | Auditoria |
| `admin-audit:actions.MEMBER_UPDATED` | Dades de l'abonat modificades | B24 | — | Auditoria |
| `admin-audit:actions.MEMBER_VALIDATED` | Preinscripció validada | B24 | — | Auditoria |
| `admin-audit:actions.MIGRATION_APPLIED` | Migració de dades aplicada | B24 | — | Auditoria |
| `admin-audit:actions.ONBOARDING_COMPLETED` | Perfil completat | B24 | — | Auditoria |
| `admin-audit:actions.PACK_ADJUSTED` | Sessions del pack ajustades | B24 | — | Auditoria |
| `admin-audit:actions.PARAMETER_CHANGED` | Configuració modificada | B24 | — | Auditoria |
| `admin-audit:actions.PAYMENT_REFUND_INTERVENTION` | Intervenció en el reemborsament del pagament | B24 | — | Auditoria |
| `admin-audit:actions.PAYMENT_REFUNDED` | Pagament reemborsat | B24 | — | Auditoria |
| `admin-audit:actions.PLATFORM_ROLES_CHANGED` | Rols de plataforma modificats | B24 | aprovat (A39.65) | Auditoria |
| `admin-audit:actions.PUBLIC_API_KEY_ROTATED` | Clau d'API pública renovada | B24 | aprovat (A39.66) | Auditoria |
| `admin-audit:actions.REMITTANCE_GENERATED` | Remesa generada | B24 | — | Auditoria |
| `admin-audit:actions.REMITTANCE_ROLLED_BACK` | Remesa retrocedida | B24 | — | Auditoria |
| `admin-audit:actions.REMITTANCE_SUBMITTED` | Remesa marcada com a enviada al banc | B24 | — | Auditoria |
| `admin-audit:actions.RING_BLOCK_CANCELLED` | Bloqueig de pista anul·lat | B24 | — | Auditoria |
| `admin-audit:actions.RING_BLOCK_CREATED` | Bloqueig de pista creat | B24 | — | Auditoria |
| `admin-audit:actions.RING_GEOMETRY_CHANGED` | Geometria de la pista modificada | B24 | — | Auditoria |
| `admin-audit:actions.RING_SETUP_REGISTERED` | Muntatge de la pista registrat | B24 | — | Auditoria |
| `admin-audit:actions.SIGNUP_EDITED` | Preinscripció modificada | B24 | — | Auditoria |
| `admin-audit:actions.SIGNUP_REJECTED` | Preinscripció rebutjada | B24 | — | Auditoria |
| `admin-audit:actions.SIGNUP_SUBMITTED` | Sol·licitud d'alta enviada | B24 | — | Auditoria |
| `admin-audit:actions.SUPPORT_ACCESS_ENDED` | Accés de suport acabat | B24 | aprovat (A39.68) | Auditoria |
| `admin-audit:actions.SUPPORT_ACCESS_STARTED` | Accés de suport iniciat | B24 | aprovat (A39.67) | Auditoria |
| `admin-audit:actions.TEMPLATE_BAND_DELETED` | Franja de plantilla esborrada | B24 | — | Auditoria |
| `admin-audit:actions.TEMPLATE_CLASS_DELETED` | Classe de plantilla eliminada | B24 | — | Auditoria |
| `admin-audit:actions.TRAINING_BOOKED_BY_CLUB` | Entrenament reservat pel club | B24 | — | Auditoria |
| `admin-audit:actions.TRAINING_CANCELLED_BY_CLUB` | Entrenament cancel·lat pel club | B24 | — | Auditoria |
| `admin-audit:actions.UPFRONT_PAYMENT_RECORDED` | Pagament inicial registrat | B24 | — | Auditoria |
| `admin-audit:actions.WEEK_VALIDATED` | Setmana validada | B24 | — | Auditoria |
| `admin-audit:columns.actor` | Actor | B24 | — | Auditoria |
| `admin-audit:columns.origin` | Origen | B24 | — | Auditoria |
| `console:access.description` | Aquest accés és només per a l'equip AgilityHub. | B24 | — | Marc del backoffice (accés, menú, estats de càrrega i d'error) |
| `console:access.title` | Consola de clubs | B24 | — |  |
| `console:audit.description` | Accions de configuració del club fetes des de la plataforma o pel mateix club. No inclou les accions sobre abonats. | B24 | — |  |
| `console:audit.empty` | Encara no hi ha cap acció de configuració. | B24 | — |  |
| `console:catalogs.clone` | Clona d'un club plantilla | B24 | — |  |
| `console:catalogs.cloning` | Clonant | B24 | — |  |
| `console:catalogs.copied` | S'ha copiat: {summary}. | B24 | — |  |
| `console:catalogs.currencyWarning` | La plantilla cobra en {template} i el club en {club}: les modalitats i els preus no es poden copiar. | B24 | — |  |
| `console:catalogs.description` | Copia nivells, pistes, modalitats amb els preus vigents, preguntes freqüents i plantilles de comunicat d'un club plantilla. | B24 | — |  |
| `console:catalogs.emptyOnly` | Només es copien les parts que el club encara té buides. | B24 | — |  |
| `console:catalogs.localeWarning` | La plantilla no té textos en {locales}: caldrà completar-los al club. | B24 | — |  |
| `console:catalogs.noTemplates` | No hi ha cap club plantilla. | B24 | — |  |
| `console:catalogs.parts.MESSAGE_TEMPLATES` | Plantilles de comunicat | B24 | — |  |
| `console:catalogs.parts.PLANS` | Modalitats i preus | B24 | — |  |
| `console:catalogs.partsLabel` | Què es copia | B24 | — |  |
| `console:catalogs.template` | Club plantilla | B24 | — |  |
| `console:catalogs.title` | Catàlegs base | B24 | — |  |
| `console:catalogs.warnings.DEFAULT_LOCALE_COPIED` | {part}: alguns textos no tenien versió en {defaultLocale} i s'hi ha copiat el text en {from}. Revisa'ls. | B24 | — |  |
| `console:catalogs.warnings.LOCALE_OMITTED` | {part}: els textos en {from} no s'han copiat, perquè el club no fa servir aquest idioma. | B24 | — |  |
| `console:checklist.goToStatus` | Activa el club | B24 | — |  |
| `console:checklist.items.branding` | Marca: logo i colors propis | B24 | aprovat (A39.30) |  |
| `console:checklist.items.dns` | Dominis verificats | B24 | aprovat (A39.31) |  |
| `console:checklist.items.firstAdmin` | Primer administrador amb accés | B24 | aprovat (A39.33) |  |
| `console:checklist.items.sepa` | Proveïdor de pagament configurat | B24 | aprovat (A39.35) |  |
| `console:checklist.items.templates` | Plantilles de comunicat | B24 | aprovat (A39.36) |  |
| `console:checklist.ready` | La checklist és completa. | B24 | — |  |
| `console:checklist.title` | Checklist d'onboarding | B24 | — |  |
| `console:common.discard` | Descarta els canvis | B24 | — |  |
| `console:common.loading` | Carregant | B24 | — |  |
| `console:common.saved` | Canvis desats. | B24 | — |  |
| `console:common.saving` | Desant | B24 | — |  |
| `console:countryProfile.ES` | Espanya | B24 | — |  |
| `console:countryProfile.GENERIC` | Genèric | B24 | — |  |
| `console:domains.add` | Afegeix domini | B24 | — |  |
| `console:domains.added` | S'ha afegit {host}. Crea un dels registres DNS i després verifica'l. | B24 | — |  |
| `console:domains.addHelp` | Escriu el host sense https://, per exemple app.exemple.cat. | B24 | — |  |
| `console:domains.adding` | Afegint | B24 | — |  |
| `console:domains.addTitle` | Afegeix domini | B24 | — |  |
| `console:domains.apps.clubs` | App dels abonats | B24 | — |  |
| `console:domains.caption` | Dominis del club | B24 | — |  |
| `console:domains.cnameTitle` | Opció 1 · CNAME | B24 | — |  |
| `console:domains.columns.host` | Host | B24 | — |  |
| `console:domains.columns.verifiedAt` | Verificat | B24 | — |  |
| `console:domains.description` | Els hosts del club per app. Un domini nou queda pendent fins que se'n verifica el registre DNS. | B24 | — |  |
| `console:domains.dnsIntro` | Crea un d'aquests dos registres al proveïdor de DNS del domini i després fes clic a Verifica. Els canvis de DNS poden trigar uns minuts. | B24 | — |  |
| `console:domains.empty` | El club encara no té cap domini. | B24 | — |  |
| `console:domains.host` | Host | B24 | — |  |
| `console:domains.hostPlaceholder` | app.exemple.cat | B24 | — |  |
| `console:domains.instructionsTitle` | Registres DNS de {host} | B24 | — |  |
| `console:domains.makePrimary` | Fes-lo principal | B24 | — |  |
| `console:domains.makePrimaryLabel` | Fes-lo principal: {host} | B24 | — |  |
| `console:domains.method.ADDRESS` | adreça del host | B24 | — |  |
| `console:domains.method.CNAME` | registre CNAME | B24 | — |  |
| `console:domains.method.TXT` | registre TXT | B24 | — |  |
| `console:domains.notVerified` | No s'ha trobat cap dels dos registres DNS de {host}. Comprova'ls i torna-ho a provar d'aquí a uns minuts. | B24 | — |  |
| `console:domains.primary` | principal | B24 | — |  |
| `console:domains.primaryChanged` | {host} és ara el domini principal ({app}). | B24 | — |  |
| `console:domains.removeConfirm` | L'app deixarà d'obrir-se en aquest host. Es pot tornar a afegir més endavant. | B24 | — |  |
| `console:domains.removed` | S'ha eliminat {host}. | B24 | — |  |
| `console:domains.removing` | Eliminant | B24 | — |  |
| `console:domains.status.BROKEN` | trencat | B24 | — |  |
| `console:domains.status.VERIFIED` | verificat | B24 | — |  |
| `console:domains.templateClub` | Un club plantilla no té dominis. | B24 | — |  |
| `console:domains.title` | Dominis | B24 | — |  |
| `console:domains.txtTitle` | Opció 2 · TXT | B24 | — |  |
| `console:domains.verified` | S'ha verificat {host} ({method}). | B24 | — |  |
| `console:domains.verifying` | Verificant | B24 | — |  |
| `console:errors.catalogNotEmpty` | {part}: el club ja en té. Només es copien les parts buides. | B24 | aprovat (A39.44) |  |
| `console:errors.domainState` | No es pot fer amb un domini en estat «{status}». | B24 | aprovat (A39.45) |  |
| `console:errors.fileTooLarge` | El fitxer és massa gran: com a màxim {maxSizeMb} MB. | B24 | aprovat (A39.47) |  |
| `console:errors.generic` | No s'ha pogut completar l'acció. Torna-ho a provar. | B24 | aprovat (A39.48) |  |
| `console:errors.moduleDependency` | Per activar {module} cal activar {requires}. | B24 | aprovat (A39.49) |  |
| `console:errors.primaryDomain` | És el domini principal de la seva app: abans fes principal un altre domini verificat. | B24 | aprovat (A39.46) |  |
| `console:errors.providerInUse` | {count, plural, one {Hi ha # abonat que paga amb aquest proveïdor.} other {Hi ha # abonats que paguen amb aquest proveïdor.}} | B24 | aprovat (A39.50) |  |
| `console:errors.stale` | Algú ha canviat el club mentrestant. Hem carregat la versió actual amb els teus canvis a sobre: revisa-la i torna a desar. | B24 | aprovat (A39.51) |  |
| `console:fieldErrors.INVALID_VALUE` | Aquest valor no és vàlid. | B24 | — |  |
| `console:fieldErrors.REQUIRED` | Aquest camp és obligatori. | B24 | — |  |
| `console:identity.fields.contactEmail` | Correu de contacte | B24 | — |  |
| `console:identity.fields.contactPhone` | Telèfon de contacte | B24 | — |  |
| `console:identity.fields.country` | País | B24 | — |  |
| `console:identity.fields.displayCity` | Població que es mostra | B24 | — |  |
| `console:identity.fields.legalName` | Nom legal | B24 | — |  |
| `console:identity.fields.postalCode` | Codi postal | B24 | — |  |
| `console:identity.fields.region` | Província | B24 | — |  |
| `console:identity.fields.slug` | Slug | B24 | — |  |
| `console:identity.fields.template` | Club plantilla | B24 | — |  |
| `console:identity.notesHelp` | Només les veu l'equip AgilityHub. | B24 | — |  |
| `console:identity.platformTitle` | Plataforma | B24 | — |  |
| `console:identity.slugHelp` | No es pot canviar un cop creat el club. | B24 | — |  |
| `console:identity.templateHelp` | Un club plantilla no opera: serveix d'origen per clonar catàlegs. | B24 | — |  |
| `console:legal.currentVersion` | Versió vigent dels textos legals: {version} | B24 | — |  |
| `console:legal.imageConsentText` | Text de consentiment d'imatge ({locale}) | B24 | — |  |
| `console:legal.newVersion` | Versió nova | B24 | — |  |
| `console:legal.noVersion` | Encara no s'ha publicat cap versió dels textos legals. | B24 | — |  |
| `console:legal.privacyPolicyUrl` | URL de la política de privacitat | B24 | — |  |
| `console:legal.publish` | Publica una versió nova | B24 | — |  |
| `console:legal.publishTitle` | Publica una versió nova dels textos legals | B24 | — |  |
| `console:legal.reconsentPolicy` | Els abonats veuran un avís a l'app per revisar els textos nous. No se'ls bloqueja l'accés. | B24 | — |  |
| `console:legal.versionHelp` | Cada versió queda registrada amb els consentiments que s'hi donen. | B24 | — |  |
| `console:legal.versionTitle` | Versió dels textos legals | B24 | — |  |
| `console:list.caption` | Clubs de la plataforma | B24 | — |  |
| `console:list.columns.checklist` | Checklist | B24 | — |  |
| `console:list.columns.countryProfile` | País | B24 | — |  |
| `console:list.columns.countryTimeZone` | País i fus | B24 | — |  |
| `console:list.columns.lastAdminAccessAt` | Últim accés d'un admin | B24 | — |  |
| `console:list.columns.modules` | Mòduls | B24 | — |  |
| `console:list.columns.slug` | Slug | B24 | — |  |
| `console:list.columns.smsSentMonth` | SMS del mes | B24 | — |  |
| `console:list.columns.storageBytes` | Emmagatzematge | B24 | — |  |
| `console:list.columns.template` | Club plantilla | B24 | — |  |
| `console:list.description` | Els clubs de la plataforma, el seu estat i l'ús del mes. | B24 | — |  |
| `console:list.emptyDescription` | Canvia la cerca o els filtres, o crea un club nou. | B24 | — |  |
| `console:list.emptyTitle` | Cap club | B24 | — |  |
| `console:list.error` | No s'han pogut carregar els clubs. | B24 | — |  |
| `console:list.moreModulesLabel` | {count, plural, one {# mòdul més} other {# mòduls més}}: {modules} | B24 | — |  |
| `console:list.newClub` | Nou club | B24 | — |  |
| `console:list.search` | Cerca per nom o slug | B24 | — |  |
| `console:list.title` | Consola de clubs | B24 | — |  |
| `console:locales.en` | Anglès | B24 | — |  |
| `console:localization.confirmIntro` | Abans de desar, revisa què canvia per al club: | B24 | — |  |
| `console:localization.confirmTitle` | Canvis de localització | B24 | — |  |
| `console:localization.consequences.countryProfile` | El perfil de país canvia les validacions de documents, codis postals i fiscalitat dels formularis del club. | B24 | aprovat (A39.38) |  |
| `console:localization.consequences.currency` | La moneda passa de {from} a {to}: els preus vigents no es converteixen i caldrà revisar les modalitats. | B24 | aprovat (A39.39) |  |
| `console:localization.consequences.defaultLocale` | Els textos que no existeixin en un idioma es mostraran en el nou idioma predeterminat. | B24 | aprovat (A39.40) |  |
| `console:localization.consequences.localesAdded` | Els textos del club (pàgines, plantilles, preguntes) s'hauran de completar en els idiomes nous. | B24 | aprovat (A39.41) |  |
| `console:localization.consequences.localesRemoved` | Els abonats ja no podran triar {locales}; els textos en aquest idioma es conserven però no es mostren. | B24 | aprovat (A39.42) |  |
| `console:localization.consequences.timeZone` | El fus horari passa de {from} a {to}: tots els horaris del club es llegiran en el fus nou. | B24 | aprovat (A39.43) |  |
| `console:localization.currencyHelp` | Codi ISO de tres lletres, per exemple EUR. | B24 | — |  |
| `console:localization.defaultNotListed` | L'idioma predeterminat ha de ser un dels idiomes del club. | B24 | — |  |
| `console:localization.description` | Els canvis en aquesta pestanya afecten tot el club: abans de desar es mostren les conseqüències. | B24 | — |  |
| `console:localization.fields.countryProfile` | Perfil de país | B24 | — |  |
| `console:localization.fields.currency` | Moneda | B24 | — |  |
| `console:localization.fields.defaultLocale` | Idioma predeterminat | B24 | — |  |
| `console:localization.fields.timeZone` | Fus horari | B24 | — |  |
| `console:localization.timeZoneHelp` | Identificador IANA, per exemple Europe/Madrid. | B24 | — |  |
| `console:localization.title` | Localització | B24 | — |  |
| `console:modules.ACTIVITIES.help` | Activitats amb inscripció (cursets, sortides) i el bloqueig de pistes que fan servir. | B24 | — |  |
| `console:modules.BILLING.help` | Rebuts, remeses, cobraments i el mètode de pagament a l'alta. | B24 | — |  |
| `console:modules.COURSES.help` | Biblioteca de recorreguts, geometria de les pistes i sessions de muntatge. | B24 | — |  |
| `console:modules.COURSES.label` | Recorreguts | B24 | — |  |
| `console:modules.FAMILY_GROUP.help` | Gossos de diversos abonats agrupats amb un pagador únic. | B24 | — |  |
| `console:modules.FAQ.help` | La pàgina de preguntes freqüents de l'app. | B24 | — |  |
| `console:modules.FREE_TRAINING.help` | Reserva de pista per entrenar sense classe, segons el nivell del gos. | B24 | — |  |
| `console:modules.INACTIVITY.help` | Períodes d'inactivitat que demanen els abonats i la seva quota. | B24 | — |  |
| `console:modules.LEARN_LINK.help` | L'accés a Learn des del menú de l'app. | B24 | — |  |
| `console:modules.LEARN_LINK.label` | Enllaç a Learn | B24 | — |  |
| `console:modules.PACKS.help` | Modalitats de packs de sessions amb el seu saldo. | B24 | — |  |
| `console:modules.PUSH.help` | Notificacions web al dispositiu de l'abonat. | B24 | — |  |
| `console:modules.SINGLE_CLASS.help` | Classes soltes que es paguen per reserva o per assistència. | B24 | — |  |
| `console:modules.SINGLE_CLASS.label` | Classes soltes | B24 | — |  |
| `console:modules.SMS.help` | El canal SMS dels avisos i comunicats. | B24 | — |  |
| `console:modules.SOCIAL_LEAGUE.help` | Resultats de la lliga social del club. | B24 | — |  |
| `console:modules.STATS.help` | Estadístiques de l'abonat a l'app. | B24 | — |  |
| `console:modules.TASKS.help` | Tasques, notes dels instructors, observacions i el seguiment d'alumnes. | B24 | — |  |
| `console:modules.TASKS.label` | Tasques i seguiment | B24 | — |  |
| `console:modules.WAITLIST.help` | Llista d'espera de les classes completes. | B24 | — |  |
| `console:modulesTab.description` | Activa els mòduls del club. Cada mòdul diu què activa i de quins depèn. | B24 | — |  |
| `console:modulesTab.noDataLoss` | Desactivar un mòdul no esborra cap dada: si es torna a activar, tot torna a aparèixer. | B24 | — |  |
| `console:modulesTab.presets` | Configuracions predefinides | B24 | — |  |
| `console:modulesTab.requiredBy` | En depèn: {modules} | B24 | — |  |
| `console:modulesTab.requires` | Cal activar abans: {modules} | B24 | — |  |
| `console:modulesTab.title` | Mòduls | B24 | — |  |
| `console:parameters.note` | Els valors del club: els que ha canviat i, la resta, el valor per defecte. Des d'aquí també es poden editar els paràmetres de plataforma. | B24 | — |  |
| `console:parameters.override` | valor del club | B24 | — |  |
| `console:parameters.platformOnly` | només plataforma | B24 | — |  |
| `console:parameters.saved` | {label}: valor desat. | B24 | — |  |
| `console:parameters.stale` | Algú l'ha canviat mentrestant: ara val {value}. Si deses, el substitueixes pel teu valor. | B24 | — |  |
| `console:payments.billingOff` | El mòdul Facturació no està actiu: els proveïdors es poden configurar però no es fan servir fins que s'activi. | B24 | — |  |
| `console:payments.configured` | configurat | B24 | — |  |
| `console:payments.enabledLabel` | Proveïdor activat | B24 | — |  |
| `console:payments.manual.defaultRequired` | Cal el text en l'idioma predeterminat del club. | B24 | — |  |
| `console:payments.manual.description` | Instruccions per pagar en efectiu o per transferència, que es mostren a l'alta. | B24 | — |  |
| `console:payments.manual.instructions` | Instruccions ({locale}) | B24 | — |  |
| `console:payments.manual.title` | Pagament manual | B24 | — |  |
| `console:payments.notConfigured` | sense configurar | B24 | — |  |
| `console:payments.remove` | Retira el proveïdor | B24 | — |  |
| `console:payments.removeConfirm` | Se n'esborrarà la configuració. Si hi ha abonats que l'utilitzen, no es podrà retirar. | B24 | — |  |
| `console:payments.sepa.creditorId` | Identificador de creditor | B24 | — |  |
| `console:payments.sepa.creditorName` | Nom del creditor | B24 | — |  |
| `console:payments.sepa.ibanHelpNew` | Només d'escriptura: un cop desat no es torna a mostrar. | B24 | — |  |
| `console:payments.sepa.ibanHelpStored` | IBAN desat: {masked}. Deixa-ho en blanc per mantenir-lo. | B24 | — |  |
| `console:payments.sepa.invoiceSeriesPattern` | Sèrie de factures | B24 | — |  |
| `console:payments.sepa.title` | Domiciliació SEPA | B24 | — |  |
| `console:payments.stripe.configuredSummary` | configurada | B24 | — |  |
| `console:payments.stripe.last4` | clau pública …{last4} | B24 | — |  |
| `console:payments.stripe.lastTest` | última prova OK {at} | B24 | — |  |
| `console:payments.stripe.modes.live` | live | B24 | — |  |
| `console:payments.stripe.modes.test` | test | B24 | — |  |
| `console:payments.stripe.neverTested` | sense provar | B24 | — |  |
| `console:payments.stripe.publishableHelp` | La clau pública (pk_…). Cal tornar-la a escriure cada cop que es desa. | B24 | — |  |
| `console:payments.stripe.publishableKey` | Clau pública | B24 | — |  |
| `console:payments.stripe.secretKey` | Clau secreta | B24 | — |  |
| `console:payments.stripe.test` | Prova la connexió | B24 | — |  |
| `console:payments.stripe.testing` | Provant | B24 | — |  |
| `console:payments.stripe.testOk` | Connexió correcta amb el compte {account} ({mode}). | B24 | — |  |
| `console:payments.stripe.title` | Stripe | B24 | — |  |
| `console:payments.stripe.webhookSecret` | Secret del webhook | B24 | — |  |
| `console:payments.writeOnly` | Només d'escriptura: un cop desada no es torna a mostrar. | B24 | — |  |
| `console:payments.writeOnlyKept` | Desada. Deixa-ho en blanc per mantenir-la. | B24 | — |  |
| `console:presets.CANIC` | Com el club pilot | B24 | aprovat (A39.24) |  |
| `console:processes.columns.health` | Salut | B24 | — |  |
| `console:processes.columns.lastRun` | Última execució | B24 | — |  |
| `console:processes.description` | Els processos automàtics del club, l'última execució i la seva salut. Es poden simular o executar ara. | B24 | — |  |
| `console:processes.empty` | El club no té cap procés actiu. | B24 | — |  |
| `console:processes.health.ALERT` | alerta | B24 | — |  |
| `console:processes.health.OK` | correcte | B24 | — |  |
| `console:processes.title` | Processos | B24 | — |  |
| `console:publicKey.confirm` | GENERA LA CLAU | B24 | — |  |
| `console:publicKey.confirmText` | La clau actual deixarà de funcionar d'aquí a 24 hores: abans cal posar la nova al web del club. | B24 | — |  |
| `console:publicKey.confirmTitle` | Genera una clau d'API nova | B24 | — |  |
| `console:publicKey.copied` | Copiada | B24 | — |  |
| `console:publicKey.copy` | Copia | B24 | — |  |
| `console:publicKey.description` | La clau amb què el web del club llegeix el calendari i les activitats públiques. Només es mostra un cop: una clau nova substitueix l'anterior, que continua funcionant 24 hores. | B24 | — |  |
| `console:publicKey.generate` | Genera una clau nova | B24 | — |  |
| `console:publicKey.generating` | Generant la clau | B24 | — |  |
| `console:publicKey.keyLabel` | Clau d'API pública nova | B24 | — |  |
| `console:publicKey.shownOnce` | Copia-la ara: no es tornarà a mostrar. | B24 | — |  |
| `console:publicKey.title` | Clau d'API pública | B24 | — |  |
| `console:record.back` | Clubs | B24 | — |  |
| `console:record.created` | S'ha creat el club {name}. Completa la checklist d'onboarding per activar-lo. | B24 | — |  |
| `console:record.reloadFailed` | No s'ha pogut tornar a llegir el club: les dades que es mostren poden no ser les últimes. Torna-ho a provar abans de fer cap altre canvi. | B24 | — |  |
| `console:record.tabsLabel` | Seccions de la fitxa del club | B24 | — |  |
| `console:status.ONBOARDING` | En configuració | B24 | aprovat (A39.1) |  |
| `console:status.SUSPENDED` | Suspès | B24 | aprovat (A39.3) |  |
| `console:statusTab.actions.ACTIVE` | Suspèn el club | B24 | — |  |
| `console:statusTab.actions.ONBOARDING` | Activa el club | B24 | — |  |
| `console:statusTab.actions.SUSPENDED` | Reactiva el club | B24 | — |  |
| `console:statusTab.changed` | S'ha canviat l'estat del club. | B24 | — |  |
| `console:statusTab.checklistComplete` | La checklist d'onboarding és completa: el club es pot activar. | B24 | — |  |
| `console:statusTab.checklistIncomplete` | Encara falten punts de la checklist: {items}. El club es pot activar igualment. | B24 | — |  |
| `console:statusTab.current` | Estat actual: | B24 | — |  |
| `console:statusTab.description` | L'activació és sempre manual. Cada canvi d'estat queda a l'auditoria. | B24 | — |  |
| `console:statusTab.meaning.ACTIVE` | El club opera amb normalitat. | B24 | aprovat (A39.5) |  |
| `console:statusTab.meaning.ONBOARDING` | El club ja funciona i els administradors veuen un bàner de configuració. | B24 | aprovat (A39.4) |  |
| `console:statusTab.meaning.SUSPENDED` | Els accessos al club es rebutgen i els processos no s'executen. | B24 | aprovat (A39.6) |  |
| `console:statusTab.reason` | Motiu de la suspensió | B24 | — |  |
| `console:statusTab.suspendEffects` | En suspendre: es rebutgen els accessos al club, els processos automàtics se salten i els cobraments en línia queden en cua fins que es reactivi. | B24 | aprovat (A39.7) |  |
| `console:support.description` | Obre el backoffice del club en una pestanya nova, com a administrador i durant un temps limitat. Totes les accions queden a l'auditoria del club, i no s'hi poden veure IBAN complets ni exportar dades personals. | B24 | — |  |
| `console:support.enter` | Entra com a administrador del club | B24 | — |  |
| `console:support.entering` | Obrint l'accés | B24 | — |  |
| `console:support.granted` | S'ha obert el backoffice del club en una pestanya nova. L'accés dura fins al {until}. | B24 | — |  |
| `console:support.noAdminHost` | El club no té cap domini del backoffice verificat: afegeix-ne un a la pestanya Dominis. | B24 | — |  |
| `console:support.opensHost` | S'obrirà {host}. | B24 | — |  |
| `console:support.popupBlocked` | El navegador no ha deixat obrir la pestanya nova. Permet les finestres emergents per a aquesta pàgina i torna-ho a provar. | B24 | — |  |
| `console:support.reason` | Motiu de l'accés | B24 | — |  |
| `console:support.title` | Accés de suport | B24 | — |  |
| `console:tabs.catalegs` | Catàlegs base | B24 | — |  |
| `console:tabs.dominis` | Dominis | B24 | — |  |
| `console:tabs.equip` | Equip | B24 | — |  |
| `console:tabs.localitzacio` | Localització | B24 | — |  |
| `console:tabs.moduls` | Mòduls | B24 | — |  |
| `console:tabs.pagaments` | Pagaments | B24 | — |  |
| `console:tabs.processos` | Processos | B24 | — |  |
| `console:team.caption` | Administradors del club | B24 | — |  |
| `console:team.columns.lastAccess` | Últim accés | B24 | — |  |
| `console:team.columns.platformAdmin` | Admin de plataforma | B24 | — |  |
| `console:team.description` | Els administradors del club. Un club ha de tenir sempre almenys un administrador. | B24 | — |  |
| `console:team.email` | Correu electrònic | B24 | — |  |
| `console:team.empty` | El club encara no té cap administrador. | B24 | — |  |
| `console:team.invite` | CONVIDA | B24 | — |  |
| `console:team.invited` | S'ha enviat la invitació a {email}. | B24 | — |  |
| `console:team.inviteHelp` | Es crea el compte si cal, se li dona el rol d'administrador i rep un enllaç d'accés per correu. | B24 | — |  |
| `console:team.inviteTitle` | Convida un administrador | B24 | — |  |
| `console:team.inviting` | Convidant | B24 | — |  |
| `console:team.membership.SUSPENDED` | retirat | B24 | — |  |
| `console:team.platformAdminFor` | {name} és admin de plataforma | B24 | — |  |
| `console:team.removeConfirm` | Deixarà de ser administrador del club. Les seves dades i el seu compte es conserven. | B24 | — |  |
| `console:team.title` | Equip | B24 | — |  |
| `console:theme.addRingColor` | Afegeix un color | B24 | — |  |
| `console:theme.chooseLogo` | Tria una imatge | B24 | — |  |
| `console:theme.chooseLogoLabel` | Tria una imatge: {logo} | B24 | — |  |
| `console:theme.colors.onPrimary` | Text sobre el principal | B24 | — |  |
| `console:theme.colors.primary` | Principal | B24 | — |  |
| `console:theme.colors.success` | Correcte | B24 | — |  |
| `console:theme.colors.surface` | Superfície | B24 | — |  |
| `console:theme.colors.surfaceAlt` | Superfície alternativa | B24 | — |  |
| `console:theme.colors.textMuted` | Text secundari | B24 | — |  |
| `console:theme.colorsHelp` | Els colors del tema del club. El contrast del text ha de complir el nivell AA (4,5:1). | B24 | — |  |
| `console:theme.contrastBlocked` | Hi ha colors sense prou contrast: corregeix-los abans de desar. | B24 | — |  |
| `console:theme.contrastFail` | {ratio}:1 · no compleix AA | B24 | — |  |
| `console:theme.contrastFailure` | Contrast {ratio}:1 sobre «{background}»: cal com a mínim 4,5:1. | B24 | — |  |
| `console:theme.contrastTitle` | Contrast AA | B24 | — |  |
| `console:theme.fontFamily` | Tipografia | B24 | — |  |
| `console:theme.logoAlt.logoDark` | Logo per a mode fosc | B24 | — |  |
| `console:theme.logoPending` | {name} es publicarà en desar. | B24 | — |  |
| `console:theme.logos.logoDark` | Logo per a mode fosc | B24 | — |  |
| `console:theme.logos.mark` | Marca (versió petita) | B24 | — |  |
| `console:theme.logosHelp` | Imatges del club. El logo es fa servir a les pantalles d'accés; la marca, a la capçalera. | B24 | — |  |
| `console:theme.logosTitle` | Logos | B24 | — |  |
| `console:theme.modes.dark` | Fosc | B24 | — |  |
| `console:theme.noLogo` | sense imatge | B24 | — |  |
| `console:theme.preview.clubs` | App dels abonats | B24 | — |  |
| `console:theme.preview.kpi` | 12 preinscripcions pendents | B24 | — |  |
| `console:theme.preview.nextClass` | Propera classe | B24 | — |  |
| `console:theme.preview.primary` | Principal | B24 | — |  |
| `console:theme.preview.secondary` | Secundari | B24 | — |  |
| `console:theme.preview.when` | Dimarts 18:00 · Pista 1 | B24 | — |  |
| `console:theme.previewTitle` | Previsualització | B24 | — |  |
| `console:theme.radius` | Radi de les vores | B24 | — |  |
| `console:theme.radiusHelp` | En píxels, per exemple 8px. | B24 | — |  |
| `console:theme.removeLogo` | Treu la imatge | B24 | — |  |
| `console:theme.removeRingColor` | Treu el color {index} | B24 | — |  |
| `console:theme.ringColor` | Color de pista {index} | B24 | — |  |
| `console:theme.ringPalette` | Colors de les pistes | B24 | — |  |
| `console:theme.typographyTitle` | Tipografia i forma | B24 | — |  |
| `console:theme.uploadFailed` | No s'ha pogut pujar la imatge. | B24 | — |  |
| `console:theme.uploading` | Pujant la imatge | B24 | — |  |
| `console:usage.description` | Comptadors agregats del mes; la consola no mostra dades d'abonats. | B24 | — |  |
| `console:usage.smsSentMonth` | SMS enviats | B24 | — |  |
| `console:usage.storage` | Emmagatzematge | B24 | — |  |
| `console:wizard.adminHelp` | Rebrà una invitació per correu amb un enllaç d'accés com a administrador del club. | B24 | — |  |
| `console:wizard.catalogsHelp` | Els catàlegs del club nou es poden copiar d'un club plantilla, o començar buits. | B24 | — |  |
| `console:wizard.catalogsStartingPoint` | És un punt de partida: el club els pot editar després. | B24 | — |  |
| `console:wizard.create` | CREA EL CLUB | B24 | — |  |
| `console:wizard.creating` | Creant el club | B24 | — |  |
| `console:wizard.definitionTitle` | Fitxer club-as-code | B24 | — |  |
| `console:wizard.description` | Vuit passos per crear un club. Es crea en configuració i després es completa la checklist d'onboarding. | B24 | aprovat (A39.52) |  |
| `console:wizard.discardDraft` | Descarta l'esborrany | B24 | — |  |
| `console:wizard.draftRestored` | S'ha recuperat l'esborrany desat en aquest dispositiu. Les dades personals no s'hi desen. | B24 | — |  |
| `console:wizard.draftSaved` | Esborrany desat en aquest dispositiu, sense les dades personals. | B24 | — |  |
| `console:wizard.ibanLater` | L'IBAN es desa a la pestanya Pagaments de la fitxa, un cop creat el club. | B24 | — |  |
| `console:wizard.invoiceSeriesHelp` | Opcional, per exemple '{YYYY}'. | B24 | — |  |
| `console:wizard.logoLater` | Els logos es pugen a la pestanya Tema de la fitxa, un cop creat el club. | B24 | — |  |
| `console:wizard.noTemplate` | Cap: catàlegs buits | B24 | — |  |
| `console:wizard.paymentsLater` | Els pagaments es poden deixar per més tard: es configuren a la fitxa del club. | B24 | — |  |
| `console:wizard.presetHelp.CANIC` | Els mòduls del club pilot: tots llevat de classes soltes, estadístiques i lliga social. | B24 | aprovat (A39.27) |  |
| `console:wizard.presetHelp.COMPLET` | Tots els mòduls llevat d'estadístiques i lliga social. | B24 | aprovat (A39.28) |  |
| `console:wizard.presetHelp.MINIM` | Només llista d'espera, preguntes freqüents i notificacions push. | B24 | aprovat (A39.29) |  |
| `console:wizard.presetModules` | Mòduls que s'activen | B24 | — |  |
| `console:wizard.problems.admin.email` | Escriu un correu electrònic vàlid. | B24 | — |  |
| `console:wizard.problems.admin.name` | Escriu el nom de l'administrador. | B24 | — |  |
| `console:wizard.problems.identity.name` | Escriu el nom del club. | B24 | — |  |
| `console:wizard.problems.identity.slug` | Entre 3 i 40 caràcters: minúscules, números i guions. | B24 | — |  |
| `console:wizard.problems.localization.currency` | Codi ISO de tres lletres, per exemple EUR. | B24 | — |  |
| `console:wizard.problems.localization.defaultLocale` | L'idioma predeterminat ha de ser un dels idiomes del club. | B24 | — |  |
| `console:wizard.problems.localization.locales` | Tria com a mínim un idioma. | B24 | — |  |
| `console:wizard.problems.localization.timeZone` | Escriu el fus horari del club. | B24 | — |  |
| `console:wizard.problems.theme.contrast` | No té prou contrast (cal 4,5:1). | B24 | — |  |
| `console:wizard.saveDraft` | Desa com a esborrany | B24 | — |  |
| `console:wizard.secretsLater` | Les claus secretes es desen a la pestanya Pagaments de la fitxa. | B24 | — |  |
| `console:wizard.slugHelp` | Es proposa a partir del nom. No es pot canviar un cop creat el club. | B24 | — |  |
| `console:wizard.steps.admin` | Primer administrador | B24 | — |  |
| `console:wizard.steps.catalogs` | Catàlegs base | B24 | — |  |
| `console:wizard.steps.localization` | Localització | B24 | — |  |
| `console:wizard.steps.modules` | Mòduls | B24 | — |  |
| `console:wizard.steps.payments` | Pagaments | B24 | — |  |
| `console:wizard.stepsLabel` | Passos de l'assistent | B24 | — |  |
| `console:wizard.themeCustom` | Colors del club | B24 | — |  |
| `console:wizard.themeProduct` | Tema AgilityHub | B24 | — |  |
| `console:wizard.title` | Nou club | B24 | — |  |
| `console:wizard.unnamed` | Club nou | B24 | — |  |

## Auditoria

| Clau | Text (ca) | Font | Registre | També a |
|---|---|---|---|---|
| `admin-audit:caption` | Entrades d'auditoria | B24 | — |  |
| `admin-audit:changesCount` | {count, plural, =0 {Cap canvi} one {# canvi} other {# canvis}} | B24 | — |  |
| `admin-audit:drawer.actor` | Actor | B24 | — |  |
| `admin-audit:drawer.close` | Tanca el detall del canvi | B24 | — |  |
| `admin-audit:drawer.genericError` | No s'ha pogut carregar el detall del canvi. | B24 | — |  |
| `admin-audit:drawer.loading` | Carregant el detall del canvi… | B24 | — |  |
| `admin-audit:drawer.noChanges` | Aquesta entrada no conté canvis de camps. | B24 | — |  |
| `admin-audit:drawer.origin` | Origen | B24 | — |  |
| `admin-audit:drawer.title` | Detall del canvi | B24 | — |  |
| `admin-audit:emptyDescription` | Prova de canviar la cerca o els filtres. | B24 | — |  |
| `admin-audit:emptyTitle` | No hi ha entrades d'auditoria | B24 | — |  |
| `admin-audit:exports.close` | Tanca les exportacions | B24 | — |  |
| `admin-audit:exports.created` | Creada el {date} | B24 | — |  |
| `admin-audit:exports.description` | Els fitxers preparats es poden descarregar durant set dies. | B24 | — |  |
| `admin-audit:exports.download` | Descarrega {fileName} | B24 | — |  |
| `admin-audit:exports.empty` | Encara no hi ha exportacions. | B24 | — |  |
| `admin-audit:exports.error` | No s'han pogut carregar les exportacions. | B24 | — |  |
| `admin-audit:exports.failed` | No s'ha pogut preparar el fitxer. | B24 | — |  |
| `admin-audit:exports.limit` | S'ha assolit el límit d'exportacions simultànies. Espera que en finalitzi una i torna-ho a provar. | B24 | — |  |
| `admin-audit:exports.loading` | Carregant les exportacions… | B24 | — |  |
| `admin-audit:exports.progress` | {progress}% completat | B24 | — |  |
| `admin-audit:exports.queuedNotice` | Preparant l'exportació… | B24 | — |  |
| `admin-audit:exports.status.EXPIRED` | Caducada | B24 | — |  |
| `admin-audit:exports.status.QUEUED` | En cua | B24 | — |  |
| `admin-audit:exports.status.READY` | Preparada | B24 | — |  |
| `admin-audit:exports.status.RUNNING` | En preparació | B24 | — |  |
| `admin-audit:exports.title` | Exportacions | B24 | — |  |
| `admin-audit:filters.actor` | Actor | B24 | — |  |
| `admin-audit:filters.actorRole` | Rol de l'actor | B24 | — |  |
| `admin-audit:filters.allActions` | Totes les accions | B24 | — |  |
| `admin-audit:filters.asMember` | Abonat suplantat | B24 | — |  |
| `admin-audit:filters.entity` | Tipus d'entitat | B24 | — |  |
| `admin-audit:filters.entityId` | Identificador de l'entitat | B24 | — |  |
| `admin-audit:filters.origin` | Origen | B24 | — |  |
| `admin-audit:genericError` | No s'ha pogut carregar l'auditoria. | B24 | — |  |
| `admin-audit:memberCaption` | Entrades d'auditoria de l'abonat | B24 | — |  |
| `admin-audit:memberTitle` | Auditoria de l'abonat | B24 | — |  |
| `admin-audit:origins.PLATFORM_SUPPORT` | Suport d'AgilityHub | B24 | — |  |
| `admin-audit:origins.PUBLIC` | Formulari públic | B24 | — |  |
| `admin-audit:origins.WEBHOOK` | Webhook | B24 | — |  |
| `admin-audit:roles.PLATFORM` | Plataforma | B24 | — |  |
| `admin-audit:roles.WEBHOOK` | Webhook | B24 | — |  |
| `admin-audit:rowLabel` | Obre el canvi «{action}» | B24 | — |  |
| `admin-audit:search` | Cerca per acció, actor o entitat | B24 | — |  |
| `admin-audit:support.alreadyEnded` | Aquest accés ja s'havia acabat. | B24 | — |  |
| `admin-audit:support.end` | Acaba l'accés | B24 | — |  |
| `admin-audit:support.ended` | S'ha acabat l'accés de suport de {name}. | B24 | — |  |
| `admin-audit:support.endFailed` | No s'ha pogut acabar l'accés. Torna-ho a provar. | B24 | — |  |
| `admin-audit:support.ending` | Acabant | B24 | — |  |
| `admin-audit:support.item` | {name}, de l'equip AgilityHub · des del {from} fins al {until} | B24 | — |  |
| `admin-audit:support.loadFailed` | No s'han pogut llegir els accessos de suport en curs. | B24 | aprovat (A39.235) |  |
| `admin-audit:support.title` | Accessos de suport en curs | B24 | — |  |
| `admin-audit:support.unknownActor` | Equip AgilityHub | B24 | — |  |
| `census:list.exportError` | No s'ha pogut completar l'acció. Torna-ho a provar. | B24 | — |  |

## Accés de suport

| Clau | Text (ca) | Font | Registre | També a |
|---|---|---|---|---|
| `shell:support.banner` | Accés de suport de l'equip AgilityHub · {name} · fins al {until} | B24 | — |  |
| `shell:support.bannerLabel` | Accés de suport | B24 | — |  |
| `shell:support.ended` | L'accés de suport ha acabat: ha caducat o l'administrador del club l'ha acabat. Ja pots tancar aquesta pestanya. | B24 | — |  |
| `shell:support.entering` | Obrint el backoffice del club… | B24 | — |  |
| `shell:support.exitFailed` | No s'ha pogut acabar l'accés de suport. Comprova la connexió i torna-ho a provar. | B24 | — |  |
| `shell:support.leavingMessage` | Sortint de l'accés de suport… | B24 | — |  |
| `shell:support.left` | Has sortit de l'accés de suport. Ja pots tancar aquesta pestanya. | B24 | — |  |
| `shell:support.noOpener` | Aquest accés s'obre des de la consola de clubs, amb «Entra com a administrador del club». | B24 | — |  |
| `shell:support.refused` | No s'ha pogut obrir l'accés de suport. Torna-ho a provar des de la consola de clubs. | B24 | — |  |
| `shell:support.retryExit` | Torna a provar de sortir | B24 | — |  |
| `shell:support.timeout` | No ha arribat l'accés de suport. Torna-ho a provar des de la consola de clubs. | B24 | — |  |
| `shell:support.title` | Accés de suport | B24 | — |  |

## Marc del backoffice (accés, menú, estats de càrrega i d'error)

| Clau | Text (ca) | Font | Registre | També a |
|---|---|---|---|---|
| `admin-audit:exports.open` | Exportacions | B24 | — |  |
| `auth:access.magicLink` | Envia'm l'enllaç | B24 | — |  |
| `auth:access.passwordReveal` | Tinc contrasenya | B24 | — |  |
| `auth:admin.handoffError` | Aquest accés al backoffice no és vàlid o ha caducat. | B24 | — |  |
| `auth:admin.handoffLoading` | Obrint el backoffice… | B24 | — |  |
| `auth:admin.title` | Accés al backoffice | B24 | — |  |
| `shell:nav.admin` | Navegació d’administració | B24 | — |  |
| `shell:nav.console` | Consola | B24 | — |  |
| `shell:nav.courses` | Recorreguts | B24 | — |  |
| `shell:nav.platform` | Plataforma | B24 | aprovat (A39.54) |  |

## AgilityHub ID (accés, compte, productes)

| Clau | Text (ca) | Font | Registre | També a |
|---|---|---|---|---|
| `id:account.description` | Gestiona les dades del teu AgilityHub ID i les sessions obertes. | B24 | — |  |
| `id:account.email` | Correu electrònic | B24 | — |  |
| `id:account.lastUsed` | Darrer ús: {date} | B24 | — |  |
| `id:account.membershipsTitle` | Pertinences | B24 | — |  |
| `id:account.noSessions` | No hi ha cap sessió activa. | B24 | — |  |
| `id:account.personalTitle` | Dades del compte | B24 | — |  |
| `id:account.products` | Consulta els teus productes | B24 | — |  |
| `id:account.revoke` | Tanca aquesta sessió | B24 | — |  |
| `id:account.saved` | Els canvis s'han desat. | B24 | — |  |
| `id:account.sessionsDescription` | Revisa els dispositius on tens la sessió oberta i tanca els que ja no facis servir. | B24 | — |  |
| `id:account.sessionsError` | No s'han pogut carregar o actualitzar les sessions. | B24 | — |  |
| `id:account.sessionsLoading` | Carregant les sessions… | B24 | — |  |
| `id:account.sessionsTitle` | Sessions actives | B24 | — |  |
| `id:account.title` | El teu compte | B24 | — |  |
| `id:brand.name` | AgilityHub ID | B24 | — |  |
| `id:brand.subtitle` | Un compte, tots els productes | B24 | — |  |
| `id:errors.generic` | No s'ha pogut completar l'acció. Torna-ho a provar. | B24 | — |  |
| `id:footer.security` | Accés segur amb AgilityHub ID | B24 | — |  |
| `id:language.en` | Anglès | B24 | — |  |
| `id:login.countdown` | Massa intents. Torna-ho a provar d'aquí a {seconds} s | B24 | aprovat (A39.198) |  |
| `id:login.description` | Accedeix al teu compte i continua al producte que has triat. | B24 | — |  |
| `id:login.email` | Correu electrònic | B24 | — |  |
| `id:login.emailRequired` | Escriu el teu correu | B24 | — |  |
| `id:login.entering` | ENTRANT… | B24 | — |  |
| `id:login.magicSent` | Si el compte existeix, hi rebràs l'enllaç | B24 | — |  |
| `id:login.title` | Entra a AgilityHub | B24 | — |  |
| `id:logout.description` | Estem tancant la sessió del teu AgilityHub ID. | B24 | — |  |
| `id:logout.title` | Tanquem la sessió | B24 | — |  |
| `id:magic.description` | Estem iniciant la sessió i preparant el teu compte. | B24 | — |  |
| `id:magic.invalidDescription` | Demana un altre enllaç per tornar a entrar. | B24 | — |  |
| `id:magic.invalidTitle` | Aquest enllaç ja no és vàlid | B24 | — |  |
| `id:magic.title` | Comprovem l'enllaç | B24 | — |  |
| `id:magic.tryAgain` | TORNA A ENTRAR | B24 | — |  |
| `id:magic.validating` | Validant l'enllaç… | B24 | — |  |
| `id:navigation.label` | Navegació del compte | B24 | — |  |
| `id:navigation.logout` | Tanca la sessió | B24 | — |  |
| `id:navigation.products` | Productes | B24 | — |  |
| `id:notFound.back` | TORNA A L'INICI | B24 | — |  |
| `id:notFound.description` | L'adreça que has obert no correspon a cap pàgina de l'AgilityHub ID. | B24 | — |  |
| `id:notFound.title` | Pàgina no trobada | B24 | — |  |
| `id:password.back` | TORNA AL COMPTE | B24 | — |  |
| `id:password.current` | Contrasenya actual | B24 | — |  |
| `id:password.description` | Pots establir o canviar la contrasenya del teu AgilityHub ID. | B24 | — |  |
| `id:password.next` | Contrasenya nova | B24 | — |  |
| `id:password.repeat` | Repeteix la contrasenya nova | B24 | — |  |
| `id:password.saved` | La contrasenya s'ha desat. | B24 | — |  |
| `id:products.clubsDescription` | Accedeix als clubs on tens una pertinença activa. | B24 | — |  |
| `id:products.clubsTitle` | AgilityHub Clubs | B24 | — |  |
| `id:products.consoleDescription` | Crea i governa els clubs de la plataforma. Només per a l'equip AgilityHub. | B24 | aprovat (A39.56) |  |
| `id:products.consoleTitle` | Consola de clubs | B24 | aprovat (A39.55) |  |
| `id:products.description` | Entra als productes AgilityHub vinculats al teu compte. | B24 | — |  |
| `id:products.learnDescription` | Aprèn, practica i avança amb continguts d'agility. | B24 | — |  |
| `id:products.learnTitle` | AgilityHub Learn | B24 | — |  |
| `id:products.openClubs` | OBRE CLUBS | B24 | — |  |
| `id:products.openConsole` | OBRE LA CONSOLA | B24 | aprovat (A39.57) |  |
| `id:products.openLearn` | OBRE LEARN | B24 | — |  |
| `id:products.title` | Els teus productes | B24 | — |  |
| `id:roles.instructor` | Instrucció | B24 | — |  |
| `id:roles.member` | Alumnat | B24 | — |  |
| `id:status.loadingAccount` | Carregant el compte… | B24 | — |  |

## 01 · 02 · 12 — accés i sessió

| Clau | Text (ca) | Font | Registre | També a |
|---|---|---|---|---|
| `auth:onboarding.consentLead` | He llegit i accepto | B25 | — |  |
| `auth:onboarding.loadError` | No s'ha pogut carregar aquesta informació. | B25 | — |  |
| `auth:onboarding.loading` | Carregant el teu perfil… | B25 | — |  |
| `auth:onboarding.locales.en` | Anglès | B25 | — |  |
| `auth:onboarding.policyDescription` | Llegeix i accepta la versió vigent per continuar fent servir el servei. | B25 | — |  |
| `auth:onboarding.policyTitle` | Hem actualitzat la política de privacitat | B25 | — |  |
| `auth:onboarding.postponing` | POSPOSANT… | B25 | — |  |
| `auth:onboarding.profileDescription` | Revisa les teves dades bàsiques. Pots completar-les ara o deixar-les per a més endavant. | B25 | — |  |
| `auth:onboarding.saving` | DESANT… | B25 | — |  |
| `auth:onboarding.skipData` | Ho faré més tard | B25 | — |  |
| `auth:onboarding.submitError` | No s'ha pogut desar. Torna-ho a provar. | B25 | — |  |
| `auth:onboarding.title` | Completa el teu perfil | B25 | — |  |

## Paquets compartits (transversal)

| Clau | Text (ca) | Font | Registre | També a |
|---|---|---|---|---|
| `common:gallery.confirmQuestion` | Voleu continuar? | B25 | — |  |
| `common:gallery.drawerTitle` | Detall de l'abonat | B25 | — |  |
| `common:gallery.emptyDescription` | Encara no hi ha dades | B25 | — |  |
| `common:gallery.emptyTitle` | Sense dades | B25 | — |  |
| `common:gallery.forms` | Formularis | B25 | — |  |
| `common:gallery.help` | Completeu aquest camp abans de continuar. | B25 | — |  |
| `common:gallery.loading` | Carregant | B25 | — |  |
| `common:gallery.mainNav` | Navegació principal | B25 | — |  |
| `common:gallery.name` | Nom i cognoms | B25 | — |  |
| `common:gallery.navigation` | Navegació | B25 | — |  |
| `common:gallery.openDrawer` | Obre el calaix | B25 | — |  |
| `common:gallery.openModal` | Obre el modal | B25 | — |  |
| `common:gallery.person` | Laia Pons | B25 | — |  |
| `common:gallery.required` | Camp obligatori | B25 | — |  |
| `common:gallery.saving` | Desant | B25 | — |  |
| `common:gallery.states` | Accions i estats | B25 | — |  |
| `common:gallery.tableEmpty` | Sense resultats | B25 | — |  |
| `common:gallery.theme.agilityhub` | Tema AgilityHub | B25 | aprovat (A39.206) |  |
| `common:gallery.theme.club` | Tema del club | B25 | aprovat (A39.205) |  |
| `common:gallery.title` | Galeria de components | B25 | — |  |
| `common:gallery.toast` | Mostra una notificació | B25 | — |  |
| `common:gallery.updated` | Canvis desats | B25 | — |  |
| `enums:courseWarningRule.border-clearance` | Marge al perímetre | B25 | aprovat (A39.192) |  |
| `enums:courseWarningRule.course-larger-than-ring` | Recorregut més gran que la pista | B25 | aprovat (A39.196) |  |
| `enums:courseWarningRule.course-no-go` | Zona no-go del recorregut | B25 | aprovat (A39.193) |  |
| `enums:courseWarningRule.door-clearance` | Distància a la porta | B25 | aprovat (A39.195) |  |
| `enums:courseWarningRule.obstacle-inventory` | Inventari d'obstacles | B25 | aprovat (A39.197) |  |
| `enums:courseWarningRule.outside-ring` | Fora de la pista | B25 | aprovat (A39.191) |  |
| `enums:courseWarningRule.ring-no-go` | Zona no-go de la pista | B25 | aprovat (A39.194) |  |
| `instructor:tasks.attach` | Adjunta un fitxer | B25 | — |  |
| `instructor:tasks.complete` | Marca-la com a feta | B25 | — |  |
| `instructor:tasks.deleteConfirm` | Vols eliminar aquesta tasca? | B25 | — |  |
| `instructor:tasks.edit` | Edita la tasca | B25 | — |  |
| `instructor:tasks.editField` | Text de la tasca | B25 | — |  |
| `instructor:tasks.empty` | Encara no hi ha cap tasca | B25 | — |  |
| `instructor:tasks.historyTitle` | Historial de tasques | B25 | — |  |
| `instructor:tasks.more` | Mostra'n més | B25 | — |  |
| `instructor:tasks.newTask` | Nova tasca | B25 | — |  |
| `instructor:tasks.newTaskField` | Text de la tasca nova | B25 | — |  |
| `instructor:tasks.observationsField` | Observacions privades | B25 | — |  |
| `instructor:tasks.openError` | No s'ha pogut obrir el fitxer. | B25 | — |  |
| `instructor:tasks.recover` | Recupera el meu text | B25 | — |  |
| `instructor:tasks.remove` | Elimina la tasca | B25 | — |  |
| `instructor:tasks.reopen` | Torna-la a pendent | B25 | — |  |
| `instructor:tasks.saving` | Desant | B25 | — |  |
| `instructor:tasks.staleNotice` | Algú ha desat les observacions fa un moment: revisa-les. | B25 | — |  |
| `shell:app.clubsAdmin` | AgilityHub Clubs Admin | B25 | — |  |

## Transversal — textos de més de tres pantalles

| Clau | Text (ca) | Font | Registre | També a |
|---|---|---|---|---|
| `admin-catalogs:common.saving` | Desant | B25 | — | D8 — modalitats i tarifes; D16 — pistes; D17 — instructors i administradors; D11 — paràmetres del club |
| `census:list.addFilter` | Afegeix el filtre | B25 | — | D5 · D15 — llistats d'abonats i de gossos; D5 · D15 — llistat universal; D6 — facturació i remeses; D7 — activitats; D14 — seguiment d'alumnes; Auditoria |
| `census:list.closeError` | Tanca l'error | B25 | — | D5 · D15 — llistats d'abonats i de gossos; D5 · D15 — llistat universal; D6 — facturació i remeses; D7 — activitats; D14 — seguiment d'alumnes; Auditoria |
| `census:list.createView` | Desa la vista | B25 | — | D5 · D15 — llistats d'abonats i de gossos; D5 · D15 — llistat universal; D6 — facturació i remeses; D7 — activitats; D14 — seguiment d'alumnes; Auditoria |
| `census:list.defaultView` | Vista per defecte | B25 | — | D5 · D15 — llistats d'abonats i de gossos; D5 · D15 — llistat universal; D6 — facturació i remeses; D7 — activitats; D14 — seguiment d'alumnes; Auditoria |
| `census:list.deleteView` | Elimina la vista | B25 | — | D5 · D15 — llistats d'abonats i de gossos; D5 · D15 — llistat universal; D6 — facturació i remeses; D7 — activitats; D14 — seguiment d'alumnes; Auditoria |
| `census:list.filterOperator` | Operador | B25 | — | D5 · D15 — llistats d'abonats i de gossos; D5 · D15 — llistat universal; D6 — facturació i remeses; D7 — activitats; D14 — seguiment d'alumnes; Auditoria |
| `census:list.loading` | Carregant el llistat | B25 | — | 13 · 28 — els meus gossos, les meves dades; D5 · D15 — llistats d'abonats i de gossos; D5 · D15 — llistat universal; D6 — facturació i remeses; D7 — activitats; D14 — seguiment d'alumnes; Auditoria |
| `census:list.loadingFilterValues` | Carregant valors… | B25 | — | D5 · D15 — llistats d'abonats i de gossos; D5 · D15 — llistat universal; D6 — facturació i remeses; D7 — activitats; D14 — seguiment d'alumnes; Auditoria |
| `census:list.nextPage` | Pàgina següent | B25 | — | D5 · D15 — llistats d'abonats i de gossos; D5 · D15 — llistat universal; D6 — facturació i remeses; D7 — activitats; D14 — seguiment d'alumnes; Auditoria |
| `census:list.noSavedView` | Cap vista desada | B25 | — | D5 · D15 — llistats d'abonats i de gossos; D5 · D15 — llistat universal; D6 — facturació i remeses; D7 — activitats; D14 — seguiment d'alumnes; Auditoria |
| `census:list.operators.contains` | conté | B25 | — | D5 · D15 — llistats d'abonats i de gossos; D5 · D15 — llistat universal; D6 — facturació i remeses; D7 — activitats; D14 — seguiment d'alumnes; Auditoria |
| `census:list.operators.eq` | és igual a | B25 | — | D5 · D15 — llistats d'abonats i de gossos; D5 · D15 — llistat universal; D6 — facturació i remeses; D7 — activitats; D14 — seguiment d'alumnes; Auditoria |
| `census:list.operators.exists` | té valor | B25 | — | D5 · D15 — llistats d'abonats i de gossos; D5 · D15 — llistat universal; D6 — facturació i remeses; D7 — activitats; D14 — seguiment d'alumnes; Auditoria |
| `census:list.operators.gt` | és posterior o superior a | B25 | — | D5 · D15 — llistats d'abonats i de gossos; D5 · D15 — llistat universal; D6 — facturació i remeses; D7 — activitats; D14 — seguiment d'alumnes; Auditoria |
| `census:list.operators.gte` | és igual o posterior o superior a | B25 | — | D5 · D15 — llistats d'abonats i de gossos; D5 · D15 — llistat universal; D6 — facturació i remeses; D7 — activitats; D14 — seguiment d'alumnes; Auditoria |
| `census:list.operators.lt` | és anterior o inferior a | B25 | — | D5 · D15 — llistats d'abonats i de gossos; D5 · D15 — llistat universal; D6 — facturació i remeses; D7 — activitats; D14 — seguiment d'alumnes; Auditoria |
| `census:list.operators.lte` | és igual o anterior o inferior a | B25 | — | D5 · D15 — llistats d'abonats i de gossos; D5 · D15 — llistat universal; D6 — facturació i remeses; D7 — activitats; D14 — seguiment d'alumnes; Auditoria |
| `census:list.operators.ne` | no és igual a | B25 | — | D5 · D15 — llistats d'abonats i de gossos; D5 · D15 — llistat universal; D6 — facturació i remeses; D7 — activitats; D14 — seguiment d'alumnes; Auditoria |
| `census:list.operators.nin` | no és cap de | B25 | — | D5 · D15 — llistats d'abonats i de gossos; D5 · D15 — llistat universal; D6 — facturació i remeses; D7 — activitats; D14 — seguiment d'alumnes; Auditoria |
| `census:list.operators.startsWith` | comença per | B25 | — | D5 · D15 — llistats d'abonats i de gossos; D5 · D15 — llistat universal; D6 — facturació i remeses; D7 — activitats; D14 — seguiment d'alumnes; Auditoria |
| `census:list.previousPage` | Pàgina anterior | B25 | — | D5 · D15 — llistats d'abonats i de gossos; D5 · D15 — llistat universal; D6 — facturació i remeses; D7 — activitats; D14 — seguiment d'alumnes; Auditoria |
| `census:list.removeFilter` | Treu el filtre de {field} | B25 | — | D5 · D15 — llistats d'abonats i de gossos; D5 · D15 — llistat universal; D6 — facturació i remeses; D7 — activitats; D14 — seguiment d'alumnes; Auditoria |
| `census:list.renameView` | Canvia el nom | B25 | — | D5 · D15 — llistats d'abonats i de gossos; D5 · D15 — llistat universal; D6 — facturació i remeses; D7 — activitats; D14 — seguiment d'alumnes; Auditoria |
| `census:list.saveError` | No s'ha pogut desar la vista. | B25 | — | D5 · D15 — llistats d'abonats i de gossos; D5 · D15 — llistat universal; D6 — facturació i remeses; D7 — activitats; D14 — seguiment d'alumnes; Auditoria |
| `census:list.saveViewName` | Nom de la vista | B25 | — | D5 · D15 — llistats d'abonats i de gossos; D5 · D15 — llistat universal; D6 — facturació i remeses; D7 — activitats; D14 — seguiment d'alumnes; Auditoria |
| `census:list.selectAll` | Selecciona totes les files | B25 | — | D5 · D15 — llistats d'abonats i de gossos; D5 · D15 — llistat universal; D6 — facturació i remeses; D7 — activitats; D14 — seguiment d'alumnes; Auditoria |
| `census:list.selected` | {count, plural, one {# seleccionat — accions massives:} other {# seleccionats — accions massives:}} | B25 | — | D5 · D15 — llistats d'abonats i de gossos; D5 · D15 — llistat universal; D6 — facturació i remeses; D7 — activitats; D14 — seguiment d'alumnes; Auditoria |
| `census:list.sharedView` | Vista compartida | B25 | — | D5 · D15 — llistats d'abonats i de gossos; D5 · D15 — llistat universal; D6 — facturació i remeses; D7 — activitats; D14 — seguiment d'alumnes; Auditoria |
| `census:list.sortAscending` | Ordena {column} de manera ascendent | B25 | — | D5 · D15 — llistats d'abonats i de gossos; D5 · D15 — llistat universal; D6 — facturació i remeses; D7 — activitats; D14 — seguiment d'alumnes; Auditoria |
| `census:list.sortDescending` | Ordena {column} de manera descendent | B25 | — | D5 · D15 — llistats d'abonats i de gossos; D5 · D15 — llistat universal; D6 — facturació i remeses; D7 — activitats; D14 — seguiment d'alumnes; Auditoria |
| `common:inProgress` | L'operació encara està en curs. Torna-ho a provar d'aquí a un moment. | B25 | — | 03 · 04 · 06 · 07 · 29 — inici, reservar, confirmar, reserva i espera; 04 — activitats; 16–19 — alta pública; 20 · 21 · 22 · 26 — instructor; D3 · D3b — plantilles; D4 · D4b · D4c — calendari de classes; D10 — fitxa d'abonat; D6 — facturació i remeses; D7 — activitats; D11 — paràmetres del club; D9 — comunicats i plantilles d'avís; D12 · D13 — agenda i fitxa d'alumne; D14 — seguiment d'alumnes; Entrenaments i bloquejos de pista (backoffice); D19 — consola de clubs; Components compartits (transversal); Missatges de l'api (transversal); Paquets compartits (transversal) |
| `common:unavailable.title` | No disponible | B25 | aprovat (A39.201) | 03 · 04 · 06 · 07 · 29 — inici, reservar, confirmar, reserva i espera; 04 — activitats; 08 · 24 — entrenaments i pista; Recorreguts a l'app (visor, registre, sessió de muntatge); 01 · 02 · 03b — accés, activació, tria de perfil i marc de l'app; D6 — facturació i remeses; Marc del backoffice (accés, menú, estats de càrrega i d'error); 01 · 02 · 12 — accés i sessió |
| `enums:bookingState.PAYMENT_PENDING` | pendent de pagament | B25 | — | 03 · 04 · 06 · 07 · 29 — inici, reservar, confirmar, reserva i espera; 10 · 23 — avui (quadre del dia); D4 · D4b · D4c — calendari de classes; D10 — fitxa d'abonat |

## Missatges d'error (surten a la pantalla de l'acció que falla)

| Clau | Text (ca) | Font | Registre | També a |
|---|---|---|---|---|
| `errors:ACCOUNT_BLOCKED` | El teu compte està bloquejat. | B24 | — |  |
| `errors:ACTIVITY_FULL` | Aquesta activitat està completa. | B25 | — |  |
| `errors:ACTIVITY_HAS_REGISTRATIONS` | Aquesta activitat ja té inscripcions. | B25 | — |  |
| `errors:ACTIVITY_IN_PAST` | Aquesta activitat ja ha passat. | B25 | — |  |
| `errors:ACTIVITY_INCOMPLETE` | Completa l'activitat abans de continuar. | B25 | — |  |
| `errors:ACTIVITY_NOT_PUBLISHED` | Aquesta activitat no està publicada. | B25 | — |  |
| `errors:ADMIN_TEXT_REQUIRED` | Cal escriure el text de l'avís per als alumnes. | B25 | — |  |
| `errors:ALREADY_BOOKED` | Aquesta reserva ja existeix. | B25 | — |  |
| `errors:ALREADY_ON_WAITLIST` | Ja sou a la llista d'espera. | B25 | — |  |
| `errors:ALREADY_PENDING` | Ja hi ha una sol·licitud pendent. | B25 | — |  |
| `errors:ALREADY_REGISTERED` | Aquesta inscripció ja existeix. | B25 | — |  |
| `errors:AMOUNT_EXCEEDS_DUE` | L'import supera el saldo pendent. | B25 | — |  |
| `errors:ATTACHMENT_ENTITY_MISMATCH` | L'adjunt no pertany a aquest element. | B25 | — |  |
| `errors:ATTACHMENT_LIMIT_REACHED` | S'ha assolit el límit d'adjunts. | B25 | — |  |
| `errors:ATTENDANCE_BOOKING_NOT_ACTIVE` | La reserva no està activa per passar llista. | B25 | — |  |
| `errors:ATTENDANCE_NOT_OPEN` | Encara no es pot passar llista. | B25 | — |  |
| `errors:ATTENDANCE_NOTIFIED_FINAL` | Un «ha avisat» desat és definitiu: la reserva ja s'ha anul·lat. | B25 | — |  |
| `errors:ATTENDANCE_WINDOW_CLOSED` | El període per passar llista està tancat. | B25 | — |  |
| `errors:BAND_NOT_EMPTY` | Aquesta franja no està buida. | B25 | — |  |
| `errors:BAND_OVERLAP` | Aquesta franja se superposa amb una altra. | B25 | — |  |
| `errors:BILLING_BUSY` | La facturació està processant una altra operació. | B25 | — |  |
| `errors:BOOKING_BLOCK_ALREADY_ACTIVE` | Ja hi ha un bloqueig de reserves actiu. | B25 | — |  |
| `errors:BOOKING_BLOCK_NOT_ACTIVE` | No hi ha cap bloqueig de reserves actiu. | B25 | — |  |
| `errors:BOOKING_BLOCKED` | Les reserves estan bloquejades per a aquest abonament. | B25 | — |  |
| `errors:BOOKING_LIMIT_REACHED` | S'ha assolit el límit de reserves. | B25 | — |  |
| `errors:BOOKING_NOT_CANCELLABLE` | Aquesta reserva ja no es pot anul·lar. | B25 | — |  |
| `errors:BUILD_SESSION_FINISHED` | Aquesta sessió de muntatge ha finalitzat. | B25 | — |  |
| `errors:CANNOT_CHANGE_OWN_ADMIN_ROLE` | No pots canviar el teu rol d'administrador. | B25 | — |  |
| `errors:CAPACITY_BELOW_BOOKINGS` | La capacitat no pot ser inferior a les reserves actuals. | B25 | — |  |
| `errors:CAPACITY_BELOW_REGISTRATIONS` | La capacitat no pot ser inferior a les inscripcions actuals. | B25 | — |  |
| `errors:CATALOG_NOT_EMPTY` | El catàleg ha d'estar buit. | B25 | — |  |
| `errors:CHANNEL_NOT_ALLOWED` | Aquest canal de comunicació no està permès. | B25 | — |  |
| `errors:CHIP_ALREADY_EXISTS` | Aquest número de xip ja està registrat. | B25 | — |  |
| `errors:CLASS_CONFLICT` | Aquesta classe coincideix amb una altra reserva. | B25 | — |  |
| `errors:CLASS_FULL` | Aquesta classe està completa. | B25 | — |  |
| `errors:CLASS_NOT_BOOKABLE` | Aquesta classe no es pot reservar. | B25 | — |  |
| `errors:CLASS_NOT_FULL` | Aquesta classe no està completa. | B25 | — |  |
| `errors:CLUB_CLOSED` | El club està tancat en aquest horari. | B25 | — |  |
| `errors:CLUB_NOT_EMPTY` | El club ha d'estar buit. | B25 | — |  |
| `errors:CLUB_NOT_FOUND` | No s'ha trobat el club. | B25 | — |  |
| `errors:CLUB_SUSPENDED` | Aquest club està suspès. | B25 | — |  |
| `errors:COLLECTION_DATE_TOO_SOON` | La data de cobrament és massa propera. | B25 | — |  |
| `errors:CONSENT_VERSION_OUTDATED` | Accepta la versió actual del consentiment. | B25 | — |  |
| `errors:COURSE_IN_USE` | Aquest recorregut està en ús. | B25 | — |  |
| `errors:COURSE_MODEL_INVALID` | El model del recorregut no és vàlid. | B25 | — |  |
| `errors:COURSE_NOT_VISIBLE` | Aquest recorregut no és visible. | B25 | — |  |
| `errors:CURRENCY_MISMATCH` | Les monedes no coincideixen. | B25 | — |  |
| `errors:DATA_EXPORT_TOO_SOON` | Encara no es pot sol·licitar una nova exportació de dades. | B25 | — |  |
| `errors:DESCRIPTION_REQUIRED` | Escriu una descripció. | B25 | — |  |
| `errors:DOCUMENT_NOT_PENDING` | Aquest document no està pendent de revisió. | B25 | — |  |
| `errors:DOCUMENT_REMINDER_TOO_SOON` | Encara no es pot enviar el recordatori del document. | B25 | — |  |
| `errors:DOCUMENT_TYPE_UNKNOWN` | No es reconeix el tipus de document. | B25 | — |  |
| `errors:DOG_ALREADY_BOOKED` | Aquest gos ja té una reserva. | B25 | — |  |
| `errors:DOG_CHIP_ALREADY_REGISTERED` | El xip d'aquest gos ja està registrat. | B25 | — |  |
| `errors:DOG_DOCUMENT_REQUIRED` | Cal un document per a aquest gos. | B25 | — |  |
| `errors:DOG_HAS_FUTURE_BOOKINGS` | Aquest gos té reserves futures. | B25 | — |  |
| `errors:DOG_HAS_OPEN_PACK` | Aquest gos té un bo obert. | B25 | — |  |
| `errors:DOG_NOT_ACCESSIBLE` | No pots accedir a aquest gos. | B25 | — |  |
| `errors:DOG_NOT_ACTIVE` | Aquest gos no està actiu. | B25 | — |  |
| `errors:DOG_NOT_ALLOWED` | Aquest gos no està admès per a aquesta reserva. | B25 | — |  |
| `errors:DUPLICATE_NAME` | Aquest nom ja està en ús. | B25 | — |  |
| `errors:DUPLICATE_SLUG` | Aquest identificador d'adreça ja està en ús. | B25 | — |  |
| `errors:EMAIL_EXISTS` | Ja existeix un compte amb aquest correu electrònic. | B25 | — |  |
| `errors:ERASURE_ALREADY_REQUESTED` | L'esborrament de dades ja s'ha sol·licitat. | B25 | — |  |
| `errors:ERASURE_BLOCKED` | Ara mateix no es poden esborrar les dades. | B25 | — |  |
| `errors:EXPORT_EXPIRED` | Aquesta exportació ha caducat. | B25 | — |  |
| `errors:EXPORT_LIMIT` | S'ha assolit el límit d'exportacions. | B25 | — |  |
| `errors:EXPORT_TOO_LARGE` | L'exportació és massa gran. | B25 | — |  |
| `errors:FAMILY_GROUP_MEMBER_ALREADY_IN_GROUP` | Aquest abonat ja pertany a un grup familiar. | B25 | — |  |
| `errors:FAMILY_GROUP_TOO_SMALL` | El grup familiar no té prou membres. | B25 | — |  |
| `errors:FAMILY_HOLDER_NOT_FOUND` | No s'ha trobat el titular del grup familiar. | B25 | — |  |
| `errors:FILE_NOT_FOUND` | No s'ha trobat el fitxer. | B25 | — |  |
| `errors:FILE_TOO_LARGE` | El fitxer és massa gran. | B25 | — |  |
| `errors:FILE_TYPE_NOT_ALLOWED` | Aquest tipus de fitxer no està permès. | B25 | — |  |
| `errors:FORBIDDEN` | No tens permís per fer aquesta acció. | B25 | — |  |
| `errors:GEOMETRY_INVALID` | La geometria no és vàlida. | B25 | — |  |
| `errors:HANDOFF_INVALID` | Aquest traspàs d'accés no és vàlid o ha caducat. | B25 | — |  |
| `errors:HOST_ALREADY_USED` | Aquest domini ja està en ús. | B25 | — |  |
| `errors:HOST_NOT_VERIFIED` | Aquest domini no s'ha verificat. | B25 | — |  |
| `errors:HOST_RESERVED` | Aquest domini està reservat. | B25 | — |  |
| `errors:ID_DOCUMENT_ALREADY_EXISTS` | Aquest document d'identitat ja està registrat. | B25 | — |  |
| `errors:ID_DOCUMENT_AMBIGUOUS` | El document d'identitat coincideix amb més d'un registre. | B25 | — |  |
| `errors:IDEMPOTENCY_KEY_REUSED` | La clau d'idempotència ja s'ha utilitzat per a una altra petició. | B25 | — |  |
| `errors:IMPERSONATION_DENIED` | No es permet la suplantació. | B25 | — |  |
| `errors:IMPERSONATION_NOT_ALLOWED` | No es permet la suplantació. | B25 | — |  |
| `errors:INACTIVITY_DEADLINE_PASSED` | El termini d'inactivitat ja ha passat. | B25 | — |  |
| `errors:INACTIVITY_INVALID_RANGE` | El període d'inactivitat no és vàlid. | B25 | — |  |
| `errors:INACTIVITY_INVALID_STATE` | La sol·licitud d'inactivitat no està en un estat vàlid. | B25 | — |  |
| `errors:INACTIVITY_NOT_APPLICABLE` | Aquest abonament no admet períodes d'inactivitat. | B25 | — |  |
| `errors:INACTIVITY_OVERLAP` | El període d'inactivitat se superposa amb un altre. | B25 | — |  |
| `errors:INACTIVITY_PERIOD` | Aquest abonament està en un període d'inactivitat. | B25 | — |  |
| `errors:INPUT_SCHEMA_MISMATCH` | Les dades no segueixen l'esquema esperat. | B25 | — |  |
| `errors:INSTRUCTOR_IN_USE` | Aquest instructor està en ús. | B25 | — |  |
| `errors:INSTRUCTOR_NOTICE_DISABLED` | El club no permet marcar «ha avisat» des de la llista. | B25 | — |  |
| `errors:INTERNAL_ERROR` | S'ha produït un error inesperat. Torna-ho a provar; si persisteix, indica el codi de referència al club. | B25 | aprovat (A39.211) |  |
| `errors:INVALID_API_KEY` | La clau de l'API no és vàlida. | B25 | — |  |
| `errors:INVALID_CREDENTIALS` | El correu electrònic o la contrasenya són incorrectes. | B25 | — |  |
| `errors:INVALID_FILTER` | El filtre no és vàlid. | B25 | — |  |
| `errors:INVALID_IBAN` | El número de compte bancari no és vàlid. | B25 | — |  |
| `errors:INVALID_ID_DOCUMENT` | El document d'identitat no és vàlid. | B25 | — |  |
| `errors:INVALID_PHONE` | El número de telèfon no és vàlid. | B25 | — |  |
| `errors:INVALID_REMINDER_OPTION` | L'opció de recordatori no és vàlida. | B25 | — |  |
| `errors:INVALID_SLOT_GRANULARITY` | L'interval de les franges horàries no és vàlid. | B25 | — |  |
| `errors:INVALID_STATE` | Aquest element no està en un estat vàlid per a aquesta operació. | B25 | — |  |
| `errors:INVALID_TIME_RANGE` | L'interval horari no és vàlid. | B25 | — |  |
| `errors:INVENTORY_INVALID` | L'inventari no és vàlid. | B25 | — |  |
| `errors:JOB_ALREADY_RUNNING` | Aquesta tasca programada ja s'està executant. | B25 | — |  |
| `errors:JOB_UNKNOWN` | No es reconeix la tasca programada. | B25 | — |  |
| `errors:LAST_ADMIN` | El club ha de mantenir almenys un administrador. | B25 | — |  |
| `errors:LAST_PLATFORM_ADMIN` | La plataforma ha de mantenir almenys un administrador. | B25 | — |  |
| `errors:LEAVE_ALREADY_REQUESTED` | La baixa ja s'ha sol·licitat. | B25 | — |  |
| `errors:LEAVE_ALREADY_SCHEDULED` | La baixa ja està programada. | B25 | — |  |
| `errors:LEAVE_DATE_INVALID` | La data de baixa no és vàlida. | B25 | — |  |
| `errors:LEAVE_INVALID_STATE` | La sol·licitud de baixa no està en un estat vàlid. | B25 | — |  |
| `errors:LEAVE_REASON_UNKNOWN` | No es reconeix el motiu de la baixa. | B25 | — |  |
| `errors:LEVEL_IN_USE` | Aquest nivell està en ús. | B25 | — |  |
| `errors:LEVEL_NOT_ACTIVE` | Aquest nivell no està actiu. | B25 | — |  |
| `errors:LEVEL_NOT_ALLOWED` | Aquest nivell no està permès. | B25 | — |  |
| `errors:LEVEL_REQUIRED` | Tria un nivell. | B25 | — |  |
| `errors:LEVEL_UNCHANGED` | Tria un nivell diferent. | B25 | — |  |
| `errors:LEVELS_DISABLED` | Els nivells estan desactivats per a aquest club. | B25 | — |  |
| `errors:LOCALE_NOT_ENABLED` | Aquest idioma no està activat per al club. | B25 | — |  |
| `errors:LOCALE_NOT_SUPPORTED` | Aquest idioma no és compatible. | B25 | — |  |
| `errors:LOGIN_LOCKED` | L'accés està bloquejat temporalment. | B24 | — |  |
| `errors:MAGIC_LINK_INVALID` | Aquest enllaç d'accés no és vàlid o ha caducat. | B25 | — |  |
| `errors:MAPPING_INVALID` | El mapatge de dades no és vàlid. | B25 | — |  |
| `errors:MAX_ATTEMPTS` | S'ha assolit el nombre màxim d'intents. | B25 | — |  |
| `errors:MEMBER_ALREADY_EXISTS` | Aquest abonat ja existeix. | B25 | — |  |
| `errors:MEMBER_ERASED` | Aquest abonat ha estat suprimit i ja no es pot modificar. | B25 | — |  |
| `errors:MEMBER_LEAVING` | L'abonat té la baixa programada: no es pot reservar més enllà de la data de baixa. | B25 | — |  |
| `errors:MEMBER_NOT_ACTIVE` | Aquest abonat no està actiu. | B25 | — |  |
| `errors:MEMBER_NOT_LEFT` | Aquest abonat encara no ha causat baixa. | B25 | — |  |
| `errors:MEMBERSHIP_EXISTS` | Aquest abonament ja existeix. | B25 | — |  |
| `errors:MEMBERSHIP_SUSPENDED` | Aquest abonament està suspès. | B25 | — |  |
| `errors:METHOD_NOT_ALLOWED` | Aquesta operació no està permesa. | B25 | — |  |
| `errors:MIGRATION_ALREADY_APPLIED` | Aquesta migració ja s'ha aplicat. | B25 | — |  |
| `errors:MODULE_DEPENDENCY` | Activa primer el mòdul necessari. | B25 | — |  |
| `errors:MODULE_DISABLED` | Aquest mòdul està desactivat. | B25 | — |  |
| `errors:NEXT_INVOICE_DATE_REQUIRED` | Escriu la data de la factura següent. | B25 | — |  |
| `errors:NO_INVOICES` | No hi ha factures per processar. | B25 | — |  |
| `errors:NO_MEMBERSHIP` | No tens cap abonament per a aquest club. | B25 | — |  |
| `errors:NO_PAYMENT_METHOD` | No hi ha cap mètode de pagament disponible. | B25 | — |  |
| `errors:NO_PLANNED_LEAVE` | No hi ha cap baixa planificada. | B25 | — |  |
| `errors:NO_RECIPIENTS` | No hi ha destinataris. | B25 | — |  |
| `errors:NOT_ACCEPTABLE` | El format de resposta sol·licitat no està disponible. | B25 | — |  |
| `errors:NOT_BOOKABLE` | Aquest element no es pot reservar. | B25 | — |  |
| `errors:NOT_DUE` | Aquesta tasca programada encara no s'ha d'executar. | B25 | — |  |
| `errors:NOT_FOUND` | No s'ha trobat l'element sol·licitat. | B25 | — |  |
| `errors:NOT_IMPLEMENTED` | Aquesta funció encara no està disponible. | B25 | — |  |
| `errors:NOT_YET_OPEN` | Les reserves encara no estan obertes. | B25 | — |  |
| `errors:NOTHING_TO_VALIDATE` | No hi ha res per validar. | B25 | — |  |
| `errors:ORDER_INCOMPLETE` | L'ordenació no està completa. | B25 | — |  |
| `errors:OUTSIDE_OPENING_HOURS` | L'hora seleccionada és fora de l'horari d'obertura. | B25 | — |  |
| `errors:OVERRIDE_NOT_ALLOWED` | Aquesta excepció no està permesa. | B25 | — |  |
| `errors:PACK_EMPTY` | Aquest bo no té sessions disponibles. | B25 | — |  |
| `errors:PACK_NEGATIVE` | El saldo del bo no pot ser negatiu. | B25 | — |  |
| `errors:PARAMETER_INVALID` | El valor de configuració no és vàlid. | B25 | — |  |
| `errors:PASSWORD_COMPROMISED` | Tria una contrasenya que no hagi aparegut en una filtració de dades. | B25 | — |  |
| `errors:PASSWORD_MISMATCH` | Les contrasenyes no coincideixen. | B25 | — |  |
| `errors:PASSWORD_TOO_SHORT` | La contrasenya és massa curta. | B25 | — |  |
| `errors:PAYMENT_METHOD_NOT_AVAILABLE` | Aquest mètode de pagament no està disponible. | B25 | — |  |
| `errors:PAYMENT_PROVIDER_NOT_ENABLED` | El proveïdor de pagament necessari no està activat. | B25 | — |  |
| `errors:PLACEMENT_BLOCKED` | Aquesta col·locació està bloquejada. | B24 | — |  |
| `errors:PLACEMENT_RING_MISMATCH` | La col·locació no pertany a aquesta pista. | B25 | — |  |
| `errors:PLAN_IN_USE` | Aquest pla està en ús. | B25 | — |  |
| `errors:PLAN_NOT_AVAILABLE` | Aquest pla no està disponible. | B25 | — |  |
| `errors:PLAN_NOT_PACK` | Aquest pla no és un bo de sessions. | B25 | — |  |
| `errors:PLATFORM_ONLY` | Aquesta operació només està disponible per als administradors de plataforma. | B25 | — |  |
| `errors:PRICE_LOCKED` | Aquest preu està bloquejat. | B25 | — |  |
| `errors:PRICE_OVERLAP` | Aquest preu se superposa amb un altre. | B25 | — |  |
| `errors:PRODUCTION_REQUIRES_CONFIRMATION` | Confirma l'operació abans d'executar-la a producció. | B25 | — |  |
| `errors:PROFILE_NOT_AVAILABLE` | Aquest perfil no està disponible. | B25 | — |  |
| `errors:PROVIDER_CONFIG_INVALID` | La configuració del proveïdor no és vàlida. | B25 | — |  |
| `errors:PROVIDER_IN_USE` | Aquest proveïdor està en ús. | B25 | — |  |
| `errors:PUSH_SUBSCRIPTION_INVALID` | La subscripció a les notificacions no és vàlida. | B25 | — |  |
| `errors:RATE_LIMITED` | Hi ha massa sol·licituds. Torna-ho a provar més tard. | B24 | — |  |
| `errors:READ_ONLY` | Aquest element és només de lectura. | B25 | — |  |
| `errors:REFRESH_EXPIRED` | La sessió ha caducat. Torna a iniciar la sessió. | B25 | — |  |
| `errors:REFRESH_REUSED` | La sessió ja no és vàlida. Torna a iniciar la sessió. | B25 | — |  |
| `errors:REFUND_EXCEEDS_PAID` | El reemborsament no pot superar l'import pagat. | B25 | — |  |
| `errors:REGISTRATION_CLOSED` | La inscripció està tancada. | B25 | — |  |
| `errors:REGISTRATION_NOT_CANCELLABLE` | Aquesta inscripció ja no es pot anul·lar. | B25 | — |  |
| `errors:RING_BLOCK_CONFLICT` | Aquest bloqueig de pista coincideix amb un altre element. | B25 | — |  |
| `errors:RING_BLOCK_MANAGED_BY_ACTIVITY` | Aquest bloqueig de pista es gestiona des de l'activitat. | B25 | — |  |
| `errors:RING_BLOCKED` | Aquesta pista està bloquejada. | B25 | — |  |
| `errors:RING_GEOMETRY_IN_USE` | La geometria d'aquesta pista està en ús. | B25 | — |  |
| `errors:RING_HAS_BOOKINGS` | Aquesta pista té reserves. | B25 | — |  |
| `errors:RING_IN_USE` | Aquesta pista està en ús. | B25 | — |  |
| `errors:RING_NOT_RESERVABLE` | Aquesta pista no es pot reservar. | B25 | — |  |
| `errors:RING_WITHOUT_GEOMETRY` | Aquesta pista no té geometria. | B24 | — |  |
| `errors:ROLE_MEMBER_REQUIRED` | Cal el rol d'abonat. | B25 | — |  |
| `errors:RUN_EXISTS` | Ja existeix una remesa per a aquest període. | B25 | — |  |
| `errors:RUN_NOT_ROLLBACKABLE` | Aquesta remesa no es pot retrocedir. | B25 | — |  |
| `errors:SAME_MEMBER` | Tria un abonat diferent. | B25 | — |  |
| `errors:SAVED_VIEW_NAME_TAKEN` | Ja hi ha una vista desada amb aquest nom. | B25 | — |  |
| `errors:SCHEMA_VERSION_UNSUPPORTED` | Aquesta versió de l'esquema no és compatible. | B25 | — |  |
| `errors:SEAT_HOLD_EXPIRED` | La retenció de la plaça ha caducat. | B25 | — |  |
| `errors:SEAT_TAKEN` | Aquesta plaça s'acaba d'ocupar. | B25 | — |  |
| `errors:SECRET_IN_FILE` | El fitxer conté un secret. | B25 | — |  |
| `errors:SEPA_NOT_CONFIGURED` | El cobrament per domiciliació bancària no està configurat. | B25 | — |  |
| `errors:SETUP_SOURCE_REQUIRED` | Tria l'origen del muntatge. | B25 | — |  |
| `errors:SIGNUP_ALREADY_PENDING` | Ja hi ha una sol·licitud d'alta pendent. | B25 | — |  |
| `errors:SIGNUP_CLOSED` | L'alta està tancada. | B25 | — |  |
| `errors:SIMULATION_STALE` | La simulació no està actualitzada. Torna-la a executar. | B25 | — |  |
| `errors:SLOT_NOT_ON_GRID` | La franja horària no segueix la graella configurada. | B25 | — |  |
| `errors:SLOT_OUT_OF_WINDOW` | La franja horària és fora del període permès. | B25 | — |  |
| `errors:SLOT_TAKEN` | Aquesta pista ja no està lliure. | B25 | — |  |
| `errors:SLUG_LOCKED` | L'identificador d'adreça està bloquejat. | B25 | — |  |
| `errors:SLUG_TAKEN` | Aquest identificador d'adreça ja està en ús. | B24 | — |  |
| `errors:SMS_BODY_REQUIRED` | Escriu el contingut del missatge de text. | B25 | — |  |
| `errors:SMS_BODY_TOO_LONG` | El missatge de text és massa llarg. | B25 | — |  |
| `errors:STALE_VERSION` | Aquest element s'ha modificat des d'un altre lloc. Actualitza'l i torna-ho a provar. | B25 | — |  |
| `errors:STRIPE_CONNECTION_FAILED` | No s'ha pogut connectar amb Stripe. | B24 | — |  |
| `errors:SUPPORT_RESTRICTED` | Aquesta operació està restringida durant l'accés de suport. | B25 | — |  |
| `errors:SWAP_NOT_ALLOWED` | Aquesta reserva no es pot intercanviar. | B25 | — |  |
| `errors:TARGET_MEMBER_NOT_ACTIVE` | L'abonat seleccionat no està actiu. | B25 | — |  |
| `errors:TASK_ALREADY_DONE` | Aquesta tasca ja està completada. | B25 | — |  |
| `errors:TASK_NOT_DONE` | Completa primer aquesta tasca. | B25 | — |  |
| `errors:TEMPLATE_CLUB_NOT_FOUND` | No s'ha trobat el club de plantilla. | B24 | — |  |
| `errors:TEMPLATE_INCONSISTENT` | La plantilla conté dades incoherents. | B25 | — |  |
| `errors:TEMPLATE_KIND_MISMATCH` | El tipus de plantilla no coincideix. | B25 | — |  |
| `errors:TEMPLATE_MANDATORY` | Aquesta plantilla és obligatòria. | B25 | — |  |
| `errors:TEMPLATE_NOT_CATALOG` | Aquesta plantilla no pertany al catàleg. | B25 | — |  |
| `errors:TEMPLATE_NOT_CUSTOM` | Aquesta plantilla no es pot personalitzar. | B25 | — |  |
| `errors:TEMPLATE_NOT_SENDABLE` | Aquesta plantilla no es pot enviar. | B25 | — |  |
| `errors:TEMPLATE_SYNTAX_ERROR` | La sintaxi de la plantilla no és vàlida. | B25 | — |  |
| `errors:TEMPLATE_UNKNOWN_VARIABLE` | La plantilla conté una variable desconeguda. | B25 | — |  |
| `errors:TENANT_MISMATCH` | Aquest element pertany a un altre club. | B25 | — |  |
| `errors:THEME_CONTRAST` | Els colors del tema no tenen prou contrast. | B25 | — |  |
| `errors:TIMEZONE_CHANGE_BLOCKED` | No es pot canviar el fus horari mentre hi hagi elements futurs. | B24 | — |  |
| `errors:TOO_MANY_DOCUMENTS` | S'ha assolit el límit de documents. | B25 | — |  |
| `errors:TOO_MANY_INSTRUCTORS` | Hi ha massa instructors assignats. | B25 | — |  |
| `errors:TRAINING_CANCEL_TOO_LATE` | És massa tard per anul·lar aquest entrenament. | B25 | — |  |
| `errors:TRAINING_LIMIT_REACHED` | S'ha assolit el límit de reserves d'entrenament. | B25 | — |  |
| `errors:UNAUTHENTICATED` | Inicia la sessió per continuar. | B25 | — |  |
| `errors:UNKNOWN_HOST` | No hi ha cap club configurat per a aquesta adreça. | B25 | aprovat (A39.209) |  |
| `errors:UNKNOWN_PARAMETER` | No es reconeix el valor de configuració. | B25 | — |  |
| `errors:UNSUBSCRIBE_TOKEN_INVALID` | Aquest enllaç de baixa no és vàlid o ha caducat. | B25 | — |  |
| `errors:UNSUPPORTED_MEDIA_TYPE` | El format de les dades enviades no és compatible. | B25 | — |  |
| `errors:UPFRONT_AMOUNT_EXCEEDS_DUE` | L'import inicial supera l'import pendent. | B25 | — |  |
| `errors:VALIDATION_ERROR` | Revisa els camps destacats. | B25 | — |  |
| `errors:WAITLIST_ENTRY_NOT_LIVE` | Aquesta entrada de la llista d'espera ja no està activa. | B25 | — |  |
| `errors:WAITLIST_FULL` | La llista d'espera està completa. | B25 | — |  |
| `errors:WAITLIST_LIMIT` | S'ha assolit el límit de la llista d'espera. | B25 | — |  |
| `errors:WAITLIST_NOT_NOTIFIED` | Aquesta entrada de la llista d'espera encara no s'ha notificat. | B25 | — |  |
| `errors:WAITLIST_OFFER_EXPIRED` | L'oferta de la llista d'espera ha caducat. | B25 | — |  |
| `errors:WEBHOOK_SIGNATURE_INVALID` | La signatura de la notificació web no és vàlida. | B25 | — |  |
| `errors:WEEK_ALREADY_GENERATED` | Aquesta setmana ja s'ha generat. | B25 | — |  |
| `errors:WEEK_IN_PAST` | Aquesta setmana ja ha passat. | B25 | — |  |
| `errors:WEEK_INCONSISTENT` | La setmana conté dades incoherents. | B25 | — |  |
| `errors:WEEKLY_LIMIT_DONE` | S'ha assolit el límit setmanal. | B25 | — |  |

## Sense pantalla localitzada (clau calculada al codi)

| Clau | Text (ca) | Font | Registre | També a |
|---|---|---|---|---|
| `enums:cancelReason.EXPIRED` | caducada | B25 | — |  |
| `enums:cancelReason.SYSTEM` | pel sistema | B25 | — |  |
| `enums:finishReason.SCHEDULED` | finalització prevista | B25 | — |  |
| `enums:templateStatus.ARCHIVED` | arxivada | B25 | — |  |
