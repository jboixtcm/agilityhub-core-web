# E11-W05 · locale strings changed (before `0692582a` → working tree)

## ca (63 strings)

| key | before | after |
|---|---|---|
| `admin-catalogs:rings.ringBookings.back` | — | Torna enrere |
| `admin-catalogs:rings.ringBookings.deactivate` | — | Anul·la les reserves i desactiva la pista |
| `admin-catalogs:rings.ringBookings.item` | — | {member} + {dog}{when, select, none {} other { · {when}}} |
| `admin-catalogs:rings.ringBookings.text` | — | Si continues, aquestes reserves quedaran anul·lades pel club i se'n farà l'avís: |
| `admin-catalogs:rings.ringBookings.title` | — | Aquesta pista té reserves d'entrenament |
| `admin-catalogs:rings.ringBookings.unreservable` | — | Anul·la les reserves i desa |
| `admin-census:followup.author.member` | {name} ({gender, select, female {alumna} other {alumne}}) | {name} ({gender, select, FEMALE {alumna} OTHER {alumne/a} other {alumne}}) |
| `admin-census:member.imageNotice` | {gender, select, FEMALE {No autoritza l'ús de la seva imatge: no publiqueu fotos on surti ella.} other {No autoritza l'ús de la seva imatge: no publiqueu fotos on surti ell.}} | No autoritza l'ús de la seva imatge: no publiquis fotos on surti {gender, select, FEMALE {ella} OTHER {aquesta persona} other {ell}}. |
| `admin-census:signupReview.fields.idDocument` | DNI/NIE | Document d'identitat |
| `admin-census:signupReview.readmission.documentLocked` | El DNI/NIE no es pot canviar durant una readmissió: per corregir-lo, rebutja la readmissió. | El document d'identitat no es pot canviar durant una readmissió: per corregir-lo, rebutja la readmissió. |
| `admin-census:signupReview.warning.NO_IMAGE_CONSENT` | No autoritza l'ús de la seva imatge: no publiqueu fotos on surti {gender, select, FEMALE {ella} other {ell}}. | No autoritza l'ús de la seva imatge: no publiquis fotos on surti {gender, select, FEMALE {ella} OTHER {aquesta persona} other {ell}}. |
| `admin-courses:setups.ringInactive` | — | Pista desactivada |
| `admin-scheduling:calendar.selected.exempt` | Exempta de la revisió de les 7:30 | Exempta de la revisió{time, select, none {} other { de les {time}}} |
| `auth:activation.welcome` | {gender, select, female {Benvinguda} other {Benvingut}}, {name}! | {gender, select, FEMALE {Benvinguda, {name}!} OTHER {Hola, {name}!} other {Benvingut, {name}!}} |
| `auth:profile.adminProfile` | {gender, select, female {administradora} other {administrador}} | {gender, select, FEMALE {administradora} OTHER {administrador/a} other {administrador}} |
| `auth:profile.instructorProfile` | {gender, select, female {instructora} other {instructor}} | {gender, select, FEMALE {instructora} OTHER {instructor/a} other {instructor}} |
| `auth:profile.memberProfile` | {gender, select, female {alumna} other {alumne}} | {gender, select, FEMALE {alumna} OTHER {alumne/a} other {alumne}} |
| `auth:profileChoice.admin` | {gender, select, female {Com a administradora} other {Com a administrador}} | {gender, select, FEMALE {Com a administradora} OTHER {Com a administrador/a} other {Com a administrador}} |
| `auth:profileChoice.instructor` | {gender, select, female {Com a instructora} other {Com a instructor}} | {gender, select, FEMALE {Com a instructora} OTHER {Com a instructor/a} other {Com a instructor}} |
| `auth:profileChoice.member` | {gender, select, female {Com a alumna} other {Com a alumne}} | {gender, select, FEMALE {Com a alumna} OTHER {Com a alumne/a} other {Com a alumne}} |
| `census:members.columns.idDocument` | DNI | Document d'identitat |
| `census:members.search` | Cerca per nom, DNI, gos… | Cerca per nom, document, gos… |
| `census:myData.idDocument` | DNI | Document d'identitat |
| `common:screen.failed` | — | No s'ha pogut mostrar aquesta pantalla. |
| `common:screen.reload` | — | Torna a carregar |
| `common:screen.updated` | — | L'aplicació s'ha actualitzat. Torna a carregar-la. |
| `console:domains.adminHostsNote` | Un domini del backoffice verificat ja té certificat, però el backoffice no s'hi serveix fins que operacions l'afegeix a la llista de hosts del backoffice i recarrega el servidor. | — |
| `console:status.ONBOARDING` | En posada en marxa | En configuració |
| `console:statusTab.meaning.ONBOARDING` | El club ja funciona i els administradors veuen un bàner de posada en marxa. | El club ja funciona i els administradors veuen un bàner de configuració. |
| `console:wizard.catalogsStartingPoint` | — | És un punt de partida: el club els pot editar després. |
| `console:wizard.description` | Vuit passos per crear un club. Es crea en posada en marxa i després es completa la checklist d'onboarding. | Vuit passos per crear un club. Es crea en configuració i després es completa la checklist d'onboarding. |
| `enums:billingIncident.NO_NEXT_INVOICE_DATE` | — | sense data del proper rebut |
| `enums:cancellationReason.RISK_REVIEW` | revisió de les 7:30 | revisió{time, select, none {} other { de les {time}}} |
| `enums:rollbackBlocker.COLLECTION_DATE_PASSED` | — | la data de cobrament ja ha arribat |
| `errors:ACCOUNT_BLOCKED` | El vostre compte està bloquejat. | El teu compte està bloquejat. |
| `errors:ACTIVITY_INCOMPLETE` | Completeu l'activitat abans de continuar. | Completa l'activitat abans de continuar. |
| `errors:CANNOT_CHANGE_OWN_ADMIN_ROLE` | No podeu canviar el vostre rol d'administrador. | No pots canviar el teu rol d'administrador. |
| `errors:CONSENT_VERSION_OUTDATED` | Accepteu la versió actual del consentiment. | Accepta la versió actual del consentiment. |
| `errors:DESCRIPTION_REQUIRED` | Introduïu una descripció. | Escriu una descripció. |
| `errors:DOG_NOT_ACCESSIBLE` | No podeu accedir a aquest gos. | No pots accedir a aquest gos. |
| `errors:FORBIDDEN` | No teniu permís per fer aquesta acció. | No tens permís per fer aquesta acció. |
| `errors:INTERNAL_ERROR` | S'ha produït un error inesperat. Torneu-ho a provar; si persisteix, indiqueu el codi de referència al club. | S'ha produït un error inesperat. Torna-ho a provar; si persisteix, indica el codi de referència al club. |
| `errors:LEVEL_REQUIRED` | Seleccioneu un nivell. | Tria un nivell. |
| `errors:LEVEL_UNCHANGED` | Seleccioneu un nivell diferent. | Tria un nivell diferent. |
| `errors:MODULE_DEPENDENCY` | Activeu primer el mòdul necessari. | Activa primer el mòdul necessari. |
| `errors:NEXT_INVOICE_DATE_REQUIRED` | Introduïu la data de la factura següent. | Escriu la data de la factura següent. |
| `errors:NO_MEMBERSHIP` | No teniu cap abonament per a aquest club. | No tens cap abonament per a aquest club. |
| `errors:PASSWORD_COMPROMISED` | Trieu una contrasenya que no hagi aparegut en una filtració de dades. | Tria una contrasenya que no hagi aparegut en una filtració de dades. |
| `errors:PRODUCTION_REQUIRES_CONFIRMATION` | Confirmeu l'operació abans d'executar-la a producció. | Confirma l'operació abans d'executar-la a producció. |
| `errors:RATE_LIMITED` | Hi ha massa sol·licituds. Torneu-ho a provar més tard. | Hi ha massa sol·licituds. Torna-ho a provar més tard. |
| `errors:REFRESH_EXPIRED` | La sessió ha caducat. Torneu a iniciar la sessió. | La sessió ha caducat. Torna a iniciar la sessió. |
| `errors:REFRESH_REUSED` | La sessió ja no és vàlida. Torneu a iniciar la sessió. | La sessió ja no és vàlida. Torna a iniciar la sessió. |
| `errors:RUN_NOT_ROLLBACKABLE` | Aquesta remesa no es pot revertir. | Aquesta remesa no es pot retrocedir. |
| `errors:SAME_MEMBER` | Seleccioneu un abonat diferent. | Tria un abonat diferent. |
| `errors:SETUP_SOURCE_REQUIRED` | Seleccioneu l'origen del muntatge. | Tria l'origen del muntatge. |
| `errors:SIMULATION_STALE` | La simulació no està actualitzada. Torneu-la a executar. | La simulació no està actualitzada. Torna-la a executar. |
| `errors:SMS_BODY_REQUIRED` | Introduïu el contingut del missatge de text. | Escriu el contingut del missatge de text. |
| `errors:STALE_VERSION` | Aquest element s'ha modificat des d'un altre lloc. Actualitzeu-lo i torneu-ho a provar. | Aquest element s'ha modificat des d'un altre lloc. Actualitza'l i torna-ho a provar. |
| `errors:TASK_NOT_DONE` | Completeu primer aquesta tasca. | Completa primer aquesta tasca. |
| `errors:UNAUTHENTICATED` | Inicieu la sessió per continuar. | Inicia la sessió per continuar. |
| `errors:VALIDATION_ERROR` | Reviseu els camps destacats. | Revisa els camps destacats. |
| `instructor:card.memberStatus` | {gender, select, female {Abonada} other {Abonat}} | {gender, select, FEMALE {Abonada} OTHER {Abonat/ada} other {Abonat}} |
| `signup:person.existingDogNote` | Ja ets soci i vols afegir un altre gos? Fes servir el mateix formulari: et reconeixerem pel DNI o l'email (verificació per correu) i només registrarem el gos nou. | Ja ets soci i vols afegir un altre gos? Fes servir el mateix formulari: et reconeixerem pel document d'identitat o l'email (verificació per correu) i només registrarem el gos nou. |

## es (95 strings)

| key | before | after |
|---|---|---|
| `admin-audit:actions.PACK_ADJUSTED` | Sesiones del pack ajustadas | Sesiones del bono ajustadas |
| `admin-audit:actions.REMITTANCE_ROLLED_BACK` | Remesa retrocedida | Remesa revertida |
| `admin-billing:actions.rollback` | Retroceder la remesa | Revertir la remesa |
| `admin-billing:confirm.rollback` | Retroceder | Revertir |
| `admin-billing:confirm.rollbackRemittance` | la remesa quedará retrocedida (el fichero XML se conserva). | la remesa quedará revertida (el fichero XML se conserva). |
| `admin-billing:confirm.rollbackTitle` | Retroceder la remesa · {month} | Revertir la remesa · {month} |
| `admin-billing:confirm.rollingBack` | Retrocediendo la remesa… | Revirtiendo la remesa… |
| `admin-billing:confirm.submissionBody` | La remesa quedará marcada como enviada al banco. A partir de ahí ya no se podrá retroceder. | La remesa quedará marcada como enviada al banco. A partir de ahí ya no se podrá revertir. |
| `admin-billing:drawer.cancelReasonRollback` | retroceso de la remesa | reversión de la remesa |
| `admin-billing:errors.notRollbackable` | No se puede retroceder la remesa: | No se puede revertir la remesa: |
| `admin-billing:status.rolledBack` | anulado · retroceso | anulado · reversión |
| `admin-catalogs:plans.types.pack` | pack · {count} sesiones | bono · {count} sesiones |
| `admin-catalogs:plans.types.packOption` | pack | bono |
| `admin-catalogs:plans.validityNote` | Las tarifas tienen vigencia: cambiar un precio no altera los recibos ya emitidos. Los packs caducan por meses de vigencia y generan la baja prevista automáticamente. | Las tarifas tienen vigencia: cambiar un precio no altera los recibos ya emitidos. Los bonos caducan por meses de vigencia y generan la baja prevista automáticamente. |
| `admin-catalogs:rings.ringBookings.back` | — | Volver atrás |
| `admin-catalogs:rings.ringBookings.deactivate` | — | Anular las reservas y desactivar la pista |
| `admin-catalogs:rings.ringBookings.item` | — | {member} + {dog}{when, select, none {} other { · {when}}} |
| `admin-catalogs:rings.ringBookings.text` | — | Si continúas, estas reservas quedarán anuladas por el club y se avisará: |
| `admin-catalogs:rings.ringBookings.title` | — | Esta pista tiene reservas de entrenamiento |
| `admin-catalogs:rings.ringBookings.unreservable` | — | Anular las reservas y guardar |
| `admin-census:followup.author.member` | {name} ({gender, select, female {alumna} other {alumno}}) | {name} ({gender, select, FEMALE {alumna} OTHER {alumno/a} other {alumno}}) |
| `admin-census:inactivity.notApplicable` | Las modalidades de pack no pueden solicitar inactividad. | Las modalidades de bono no pueden solicitar inactividad. |
| `admin-census:member.billing.packNegative` | El ajuste no puede dejar el pack con sesiones negativas. | El ajuste no puede dejar el bono con sesiones negativas. |
| `admin-census:member.billing.packs` | Packs | Bonos |
| `admin-census:member.billing.planNotPack` | Este concepto necesita una modalidad de pack. | Este concepto necesita una modalidad de bono. |
| `admin-census:member.imageNotice` | {gender, select, FEMALE {No autoriza el uso de su imagen: no publique fotos en las que aparezca ella.} other {No autoriza el uso de su imagen: no publique fotos en las que aparezca él.}} | No autoriza el uso de su imagen: no publiques fotos en las que aparezca {gender, select, FEMALE {ella} OTHER {esta persona} other {él}}. |
| `admin-census:member.pack` | Pack {total}: {used}/{remaining} · caduca {date} | Bono {total}: {used}/{remaining} · caduca {date} |
| `admin-census:plan.packDiscountRule` | Al pasar de un pack de {minSessions} sesiones o más a una cuota mensual, la entrada tiene un {discountPercent} % de descuento. El importe debe calcularlo la API. | Al pasar de un bono de {minSessions} sesiones o más a una cuota mensual, la entrada tiene un {discountPercent} % de descuento. El importe debe calcularlo la API. |
| `admin-census:signupReview.fields.idDocument` | DNI/NIE | Documento de identidad |
| `admin-census:signupReview.readmission.documentLocked` | El DNI/NIE no se puede cambiar durante una readmisión: para corregirlo, rechaza la readmisión. | El documento de identidad no se puede cambiar durante una readmisión: para corregirlo, rechaza la readmisión. |
| `admin-census:signupReview.warning.NO_IMAGE_CONSENT` | No autoriza el uso de su imagen: no publiquéis fotos donde salga {gender, select, FEMALE {ella} other {él}}. | No autoriza el uso de su imagen: no publiques fotos en las que aparezca {gender, select, FEMALE {ella} OTHER {esta persona} other {él}}. |
| `admin-courses:setups.ringInactive` | — | Pista desactivada |
| `admin-courses:warnings.courseNoGo` | {obstacle} toca una zona prohibida del recorrido. | {obstacle} toca una zona no-go del recorrido. |
| `admin-scheduling:calendar.selected.exempt` | Exenta de la revisión de las 7:30 | Exenta de la revisión{time, select, none {} other { de las {time}}} |
| `admin-settings:jobs.runs.filters` | Filtrar las ejecuciones | Filtros de las ejecuciones |
| `auth:access.forgot.action` | Recuperarla | Recuperar la contraseña |
| `auth:activation.welcome` | {gender, select, female {Bienvenida} other {Bienvenido}}, {name}! | {gender, select, FEMALE {¡Bienvenida, {name}!} OTHER {¡Hola, {name}!} other {¡Bienvenido, {name}!}} |
| `auth:profile.adminProfile` | {gender, select, female {administradora} other {administrador}} | {gender, select, FEMALE {administradora} OTHER {administrador/a} other {administrador}} |
| `auth:profile.instructorProfile` | {gender, select, female {instructora} other {instructor}} | {gender, select, FEMALE {instructora} OTHER {instructor/a} other {instructor}} |
| `auth:profile.memberProfile` | {gender, select, female {alumna} other {alumno}} | {gender, select, FEMALE {alumna} OTHER {alumno/a} other {alumno}} |
| `auth:profileChoice.admin` | {gender, select, female {Como administradora} other {Como administrador}} | {gender, select, FEMALE {Como administradora} OTHER {Como administrador/a} other {Como administrador}} |
| `auth:profileChoice.instructor` | {gender, select, female {Como instructora} other {Como instructor}} | {gender, select, FEMALE {Como instructora} OTHER {Como instructor/a} other {Como instructor}} |
| `auth:profileChoice.member` | {gender, select, female {Como alumna} other {Como alumno}} | {gender, select, FEMALE {Como alumna} OTHER {Como alumno/a} other {Como alumno}} |
| `census:members.columns.idDocument` | DNI | Documento de identidad |
| `census:members.search` | Buscar por nombre, DNI, perro… | Buscar por nombre, documento, perro… |
| `census:myData.idDocument` | DNI | Documento de identidad |
| `census:myDogs.packMore` | +{count} pack | +{count} bono |
| `common:screen.failed` | — | No se ha podido mostrar esta pantalla. |
| `common:screen.reload` | — | Volver a cargar |
| `common:screen.updated` | — | La aplicación se ha actualizado. Vuelve a cargarla. |
| `console:domains.adminHostsNote` | Un dominio del backoffice verificado ya tiene certificado, pero el backoffice no se sirve en él hasta que operaciones lo añade a la lista de hosts del backoffice y recarga el servidor. | — |
| `console:errors.catalogNotEmpty` | {part}: el club ya tiene. Solo se copian las partes vacías. | {part}: el club ya tiene contenido. Solo se copian las partes vacías. |
| `console:modules.PACKS.help` | Modalidades de packs de sesiones con su saldo. | Modalidades de bonos de sesiones con su saldo. |
| `console:modules.PACKS.label` | Packs | Bonos |
| `console:status.ONBOARDING` | En puesta en marcha | En configuración |
| `console:statusTab.meaning.ONBOARDING` | El club ya funciona y los administradores ven un banner de puesta en marcha. | El club ya funciona y los administradores ven un banner de configuración. |
| `console:wizard.catalogsStartingPoint` | — | Es un punto de partida: el club puede editarlos después. |
| `console:wizard.description` | Ocho pasos para crear un club. Se crea en puesta en marcha y después se completa la checklist de onboarding. | Ocho pasos para crear un club. Se crea en configuración y después se completa la checklist de onboarding. |
| `enums:billingIncident.NO_NEXT_INVOICE_DATE` | — | sin fecha del próximo recibo |
| `enums:cancellationReason.RISK_REVIEW` | revisión de las 7:30 | revisión{time, select, none {} other { de las {time}}} |
| `enums:collectionFailure.ROLLBACK` | retroceso de la remesa | reversión de la remesa |
| `enums:invoiceLineOrigin.PACK` | Pack | Bono |
| `enums:leaveSource.PACK_EXPIRED` | caducidad del pack | caducidad del bono |
| `enums:remittanceStatus.ROLLED_BACK` | retrocedida | revertida |
| `enums:rollbackBlocker.COLLECTION_DATE_PASSED` | — | la fecha de cobro ya ha llegado |
| `enums:upfrontConcept.PACK` | Pack | Bono |
| `errors:ACCOUNT_BLOCKED` | Su cuenta está bloqueada. | Tu cuenta está bloqueada. |
| `errors:ACTIVITY_INCOMPLETE` | Complete la actividad antes de continuar. | Completa la actividad antes de continuar. |
| `errors:CANNOT_CHANGE_OWN_ADMIN_ROLE` | No puede cambiar su propio rol de administrador. | No puedes cambiar tu propio rol de administrador. |
| `errors:CONSENT_VERSION_OUTDATED` | Acepte la versión actual del consentimiento. | Acepta la versión actual del consentimiento. |
| `errors:DESCRIPTION_REQUIRED` | Introduzca una descripción. | Escribe una descripción. |
| `errors:DOG_NOT_ACCESSIBLE` | No puede acceder a este perro. | No puedes acceder a este perro. |
| `errors:FORBIDDEN` | No tiene permiso para realizar esta acción. | No tienes permiso para realizar esta acción. |
| `errors:INTERNAL_ERROR` | Se ha producido un error inesperado. Vuelva a intentarlo; si persiste, indique el código de referencia al club. | Se ha producido un error inesperado. Vuelve a intentarlo; si persiste, indica el código de referencia al club. |
| `errors:LEVEL_REQUIRED` | Seleccione un nivel. | Elige un nivel. |
| `errors:LEVEL_UNCHANGED` | Seleccione un nivel diferente. | Elige un nivel diferente. |
| `errors:MODULE_DEPENDENCY` | Active primero el módulo necesario. | Activa primero el módulo necesario. |
| `errors:NEXT_INVOICE_DATE_REQUIRED` | Introduzca la fecha de la siguiente factura. | Escribe la fecha de la siguiente factura. |
| `errors:NO_MEMBERSHIP` | No tiene ningún abono para este club. | No tienes ningún abono para este club. |
| `errors:PASSWORD_COMPROMISED` | Elija una contraseña que no haya aparecido en una filtración de datos. | Elige una contraseña que no haya aparecido en una filtración de datos. |
| `errors:PRODUCTION_REQUIRES_CONFIRMATION` | Confirme la operación antes de ejecutarla en producción. | Confirma la operación antes de ejecutarla en producción. |
| `errors:RATE_LIMITED` | Hay demasiadas solicitudes. Vuelva a intentarlo más tarde. | Hay demasiadas solicitudes. Vuelve a intentarlo más tarde. |
| `errors:REFRESH_EXPIRED` | La sesión ha caducado. Vuelva a iniciar sesión. | La sesión ha caducado. Vuelve a iniciar sesión. |
| `errors:REFRESH_REUSED` | La sesión ya no es válida. Vuelva a iniciar sesión. | La sesión ya no es válida. Vuelve a iniciar sesión. |
| `errors:SAME_MEMBER` | Seleccione un abonado diferente. | Elige un abonado diferente. |
| `errors:SETUP_SOURCE_REQUIRED` | Seleccione el origen del montaje. | Elige el origen del montaje. |
| `errors:SIMULATION_STALE` | La simulación no está actualizada. Vuelva a ejecutarla. | La simulación no está actualizada. Vuelve a ejecutarla. |
| `errors:SMS_BODY_REQUIRED` | Introduzca el contenido del mensaje de texto. | Escribe el contenido del mensaje de texto. |
| `errors:STALE_VERSION` | Este elemento se ha modificado desde otro lugar. Actualícelo y vuelva a intentarlo. | Este elemento se ha modificado desde otro lugar. Actualízalo y vuelve a intentarlo. |
| `errors:TASK_NOT_DONE` | Complete primero esta tarea. | Completa primero esta tarea. |
| `errors:UNAUTHENTICATED` | Inicie sesión para continuar. | Inicia sesión para continuar. |
| `errors:VALIDATION_ERROR` | Revise los campos destacados. | Revisa los campos destacados. |
| `id:login.forgot` | ¿Has olvidado la contraseña? Recupérala | ¿Has olvidado la contraseña? Recuperar la contraseña |
| `instructor:card.memberStatus` | {gender, select, female {Abonada} other {Abonado}} | {gender, select, FEMALE {Abonada} OTHER {Abonado/a} other {Abonado}} |
| `signup:person.existingDogNote` | ¿Ya eres socio y quieres añadir otro perro? Usa el mismo formulario: te reconoceremos por el DNI o el email (verificación por correo) y solo registraremos el perro nuevo. | ¿Ya eres socio y quieres añadir otro perro? Usa el mismo formulario: te reconoceremos por el documento de identidad o el email (verificación por correo) y solo registraremos el perro nuevo. |

## en (23 strings)

| key | before | after |
|---|---|---|
| `admin-catalogs:rings.ringBookings.back` | — | Go back |
| `admin-catalogs:rings.ringBookings.deactivate` | — | Cancel the bookings and deactivate the ring |
| `admin-catalogs:rings.ringBookings.item` | — | {member} + {dog}{when, select, none {} other { · {when}}} |
| `admin-catalogs:rings.ringBookings.text` | — | If you continue, these bookings will be cancelled by the club and notified: |
| `admin-catalogs:rings.ringBookings.title` | — | This ring has training bookings |
| `admin-catalogs:rings.ringBookings.unreservable` | — | Cancel the bookings and save |
| `admin-census:member.imageNotice` | {gender, select, FEMALE {Does not authorise use of her image: do not publish photos showing her.} other {Does not authorise use of his image: do not publish photos showing him.}} | {gender, select, FEMALE {Does not authorise use of her image: do not publish photos showing her.} OTHER {Does not authorise use of their image: do not publish photos showing them.} other {Does not authorise use of his image: do not publish photos showing him.}} |
| `admin-census:signupReview.fields.idDocument` | DNI/NIE | ID document |
| `admin-courses:setups.ringInactive` | — | Ring deactivated |
| `admin-scheduling:calendar.selected.exempt` | Exempt from the 7:30 review | Exempt from the {time, select, none {review} other {{time} review}} |
| `common:screen.failed` | — | This screen could not be shown. |
| `common:screen.reload` | — | Reload |
| `common:screen.updated` | — | The app was updated. Reload it. |
| `console:domains.adminHostsNote` | A verified back-office domain gets its certificate at once, but the back office is served on it only once operations add it to the back-office host list and reload the server. | — |
| `console:status.ONBOARDING` | Onboarding | Being set up |
| `console:statusTab.meaning.ONBOARDING` | The club already works and its administrators see an onboarding banner. | The club already works and its administrators see a set-up banner. |
| `console:wizard.catalogsStartingPoint` | — | They are a starting point: the club can edit them afterwards. |
| `console:wizard.description` | Eight steps to create a club. It is created in onboarding, then the onboarding checklist is completed. | Eight steps to create a club. It is created in the set-up state, then the onboarding checklist is completed. |
| `courses:register.level` | Orientative level | Guide level |
| `enums:billingIncident.NO_NEXT_INVOICE_DATE` | — | no next invoice date |
| `enums:cancellationReason.RISK_REVIEW` | 7:30 review | {time, select, none {review} other {{time} review}} |
| `enums:rollbackBlocker.COLLECTION_DATE_PASSED` | — | the collection date has arrived |
| `instructor:card.memberStatus` | {gender, select, female {Member} other {Member}} | {gender, select, FEMALE {Member} OTHER {Member} other {Member}} |

Total: 181 strings.
