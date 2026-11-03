// -----------------------------------------------------------------------------
// Runtime texts, in the four languages of the Gladys UI.
//
// `t(key, vars)` returns a multi-language object `{ en, fr, de, es }`
// (configuration button, widgets, connection status); `text(key, language,
// vars)` returns one string (feature names, scene action errors: Gladys does
// not send the language of the user with a scan, a command or a scene
// action, see `language` in config.js). Both take a fallback for the values
// Valetudo may add later (a new preset, a new consumable).
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

const MESSAGES = {
  // --- Feature names (`<device name> - <feature>`) ---------------------------
  state: { en: 'State', fr: 'État', de: 'Zustand', es: 'Estado' },
  run_mode: { en: 'Cleaning', fr: 'Nettoyage', de: 'Reinigung', es: 'Limpieza' },
  dock: { en: 'Dock', fr: 'Retour à la base', de: 'Zur Station', es: 'Volver a la base' },
  battery: { en: 'Battery', fr: 'Batterie', de: 'Akku', es: 'Batería' },
  fan_speed: { en: 'Suction', fr: 'Aspiration', de: 'Saugkraft', es: 'Aspiración' },
  water_usage: { en: 'Water', fr: 'Eau', de: 'Wasser', es: 'Agua' },
  operation_mode: { en: 'Mode', fr: 'Mode', de: 'Modus', es: 'Modo' },

  // --- Run modes (options of the run_mode feature) ---------------------------
  modeIdle: { en: 'Stop', fr: 'Arrêt', de: 'Stopp', es: 'Parar' },
  modeCleaning: { en: 'Clean', fr: 'Nettoyer', de: 'Reinigen', es: 'Limpiar' },
  modeMapping: { en: 'Map', fr: 'Cartographier', de: 'Kartieren', es: 'Cartografiar' },

  // --- Presets (options of the select features) ------------------------------
  preset_off: { en: 'Off', fr: 'Arrêt', de: 'Aus', es: 'Apagado' },
  preset_min: { en: 'Minimum', fr: 'Minimum', de: 'Minimum', es: 'Mínimo' },
  preset_low: { en: 'Low', fr: 'Faible', de: 'Niedrig', es: 'Bajo' },
  preset_medium: { en: 'Medium', fr: 'Moyen', de: 'Mittel', es: 'Medio' },
  preset_high: { en: 'High', fr: 'Fort', de: 'Hoch', es: 'Alto' },
  preset_max: { en: 'Maximum', fr: 'Maximum', de: 'Maximum', es: 'Máximo' },
  preset_turbo: { en: 'Turbo', fr: 'Turbo', de: 'Turbo', es: 'Turbo' },
  preset_custom: { en: 'Custom', fr: 'Personnalisé', de: 'Benutzerdefiniert', es: 'Personalizado' },
  preset_vacuum: { en: 'Vacuum', fr: 'Aspiration', de: 'Saugen', es: 'Aspirar' },
  preset_mop: { en: 'Mop', fr: 'Lavage', de: 'Wischen', es: 'Fregar' },
  preset_vacuum_and_mop: {
    en: 'Vacuum and mop',
    fr: 'Aspiration et lavage',
    de: 'Saugen und Wischen',
    es: 'Aspirar y fregar',
  },
  preset_vacuum_then_mop: {
    en: 'Vacuum then mop',
    fr: 'Aspiration puis lavage',
    de: 'Erst saugen, dann wischen',
    es: 'Aspirar y luego fregar',
  },

  // --- Consumables -----------------------------------------------------------
  consumable_filter: { en: 'Filter', fr: 'Filtre', de: 'Filter', es: 'Filtro' },
  consumable_brush: { en: 'Brush', fr: 'Brosse', de: 'Bürste', es: 'Cepillo' },
  consumable_mop: { en: 'Mop pad', fr: 'Serpillière', de: 'Wischpad', es: 'Mopa' },
  consumable_detergent: {
    en: 'Detergent',
    fr: 'Détergent',
    de: 'Reinigungsmittel',
    es: 'Detergente',
  },
  consumable_bin: {
    en: 'Dust bag',
    fr: 'Sac à poussière',
    de: 'Staubbeutel',
    es: 'Bolsa de polvo',
  },
  consumable_cleaning: { en: 'Cleaning', fr: 'Nettoyage', de: 'Reinigung', es: 'Limpieza' },
  part_main: { en: 'main', fr: 'principale', de: 'Haupt', es: 'principal' },
  part_secondary: { en: 'secondary', fr: 'secondaire', de: 'Zweit', es: 'secundario' },
  part_side_left: {
    en: 'left side',
    fr: 'latérale gauche',
    de: 'Seite links',
    es: 'lateral izquierdo',
  },
  part_side_right: { en: 'side', fr: 'latérale', de: 'Seite', es: 'lateral' },
  part_dock: { en: 'dock', fr: 'station', de: 'Station', es: 'base' },
  part_sensor: { en: 'sensors', fr: 'capteurs', de: 'Sensoren', es: 'sensores' },
  part_wheel: { en: 'wheel', fr: 'roue', de: 'Rad', es: 'rueda' },
  part_all: { en: 'all', fr: 'tout', de: 'alle', es: 'todo' },
  // Whole names of the usual type + part pairs (grammar differs per language).
  consumable_brush_main: {
    en: 'Main brush',
    fr: 'Brosse principale',
    de: 'Hauptbürste',
    es: 'Cepillo principal',
  },
  consumable_brush_side_right: {
    en: 'Side brush',
    fr: 'Brosse latérale',
    de: 'Seitenbürste',
    es: 'Cepillo lateral',
  },
  consumable_brush_side_left: {
    en: 'Left side brush',
    fr: 'Brosse latérale gauche',
    de: 'Linke Seitenbürste',
    es: 'Cepillo lateral izquierdo',
  },
  consumable_brush_secondary: {
    en: 'Secondary brush',
    fr: 'Brosse secondaire',
    de: 'Zweitbürste',
    es: 'Cepillo secundario',
  },
  consumable_filter_main: { en: 'Filter', fr: 'Filtre', de: 'Filter', es: 'Filtro' },
  consumable_filter_secondary: {
    en: 'Secondary filter',
    fr: 'Filtre secondaire',
    de: 'Zweitfilter',
    es: 'Filtro secundario',
  },
  consumable_mop_main: { en: 'Mop pad', fr: 'Serpillière', de: 'Wischpad', es: 'Mopa' },
  consumable_cleaning_sensor: {
    en: 'Sensor cleaning',
    fr: 'Nettoyage des capteurs',
    de: 'Sensorreinigung',
    es: 'Limpieza de sensores',
  },
  consumable_cleaning_wheel: {
    en: 'Wheel cleaning',
    fr: 'Nettoyage de la roue',
    de: 'Radreinigung',
    es: 'Limpieza de la rueda',
  },
  consumable_bin_dock: {
    en: 'Dock dust bag',
    fr: 'Sac de la station',
    de: 'Staubbeutel der Station',
    es: 'Bolsa de la base',
  },
  consumable_detergent_dock: {
    en: 'Dock detergent',
    fr: 'Détergent de la station',
    de: 'Reinigungsmittel der Station',
    es: 'Detergente de la base',
  },
  consumableWithPart: {
    en: '{type} ({part})',
    fr: '{type} ({part})',
    de: '{type} ({part})',
    es: '{type} ({part})',
  },

  // --- Robot statuses ----------------------------------------------------------
  status_error: { en: 'Error', fr: 'Erreur', de: 'Fehler', es: 'Error' },
  status_docked: { en: 'Docked', fr: 'Sur la base', de: 'In der Station', es: 'En la base' },
  status_idle: { en: 'Idle', fr: 'Arrêté', de: 'Bereit', es: 'Parado' },
  status_returning: {
    en: 'Returning to the dock',
    fr: 'Retour à la base',
    de: 'Fährt zur Station',
    es: 'Volviendo a la base',
  },
  status_cleaning: { en: 'Cleaning', fr: 'Nettoyage', de: 'Reinigt', es: 'Limpiando' },
  status_paused: { en: 'Paused', fr: 'En pause', de: 'Pausiert', es: 'En pausa' },
  status_manual_control: {
    en: 'Manual control',
    fr: 'Pilotage manuel',
    de: 'Manuelle Steuerung',
    es: 'Control manual',
  },
  status_moving: { en: 'Moving', fr: 'En déplacement', de: 'Fährt', es: 'En movimiento' },
  statusUnknown: { en: 'Unknown', fr: 'Inconnu', de: 'Unbekannt', es: 'Desconocido' },
  flag_zone: { en: 'Zones', fr: 'Zones', de: 'Zonen', es: 'Zonas' },
  flag_segment: { en: 'Rooms', fr: 'Pièces', de: 'Räume', es: 'Habitaciones' },
  flag_spot: { en: 'Spot', fr: 'Ponctuel', de: 'Punkt', es: 'Puntual' },
  flag_target: { en: 'Go to', fr: 'Déplacement', de: 'Fahrt zum Ziel', es: 'Ir a un punto' },
  flag_resumable: { en: 'Resumable', fr: 'Reprise possible', de: 'Fortsetzbar', es: 'Reanudable' },
  flag_mapping: { en: 'Mapping', fr: 'Cartographie', de: 'Kartierung', es: 'Cartografía' },

  // --- Connection status (Integrations page) ---------------------------------
  statusConnected: {
    en: '{count} of {total} Valetudo robot(s) answering on the local network.',
    fr: '{count} robot(s) Valetudo sur {total} répondent sur le réseau local.',
    de: '{count} von {total} Valetudo-Roboter(n) antworten im lokalen Netzwerk.',
    es: '{count} de {total} robot(s) Valetudo responden en la red local.',
  },
  statusAllUnreachable: {
    en: '{count} Valetudo robot(s) known, none answering right now.',
    fr: '{count} robot(s) Valetudo connu(s), aucun ne répond pour l’instant.',
    de: '{count} Valetudo-Roboter bekannt, im Moment antwortet keiner.',
    es: '{count} robot(s) Valetudo conocido(s), ninguno responde ahora.',
  },
  statusAuth: {
    en: 'A robot refuses the user name or password (Valetudo HTTP authentication).',
    fr: 'Un robot refuse le nom d’utilisateur ou le mot de passe (authentification HTTP de Valetudo).',
    de: 'Ein Roboter lehnt Benutzername oder Passwort ab (HTTP-Authentifizierung von Valetudo).',
    es: 'Un robot rechaza el usuario o la contraseña (autenticación HTTP de Valetudo).',
  },
  statusNone: {
    en: 'No Valetudo robot found yet: open the Discover tab, or type the address of the robot.',
    fr: 'Aucun robot Valetudo trouvé pour l’instant : ouvrez l’onglet Découverte, ou saisissez l’adresse du robot.',
    de: 'Noch kein Valetudo-Roboter gefunden: Öffne den Tab Entdecken oder gib die Adresse des Roboters ein.',
    es: 'Aún no se ha encontrado ningún robot Valetudo: abra la pestaña Descubrir o escriba la dirección del robot.',
  },

  // --- "Search and test the robots" button -----------------------------------
  testOk: {
    en: '{count} robot(s) found: {list}.',
    fr: '{count} robot(s) trouvé(s) : {list}.',
    de: '{count} Roboter gefunden: {list}.',
    es: '{count} robot(s) encontrado(s): {list}.',
  },
  testNone: {
    en: 'No Valetudo robot found. Check that the robot is on and on the same network, or type its address (shown in the Valetudo UI).',
    fr: 'Aucun robot Valetudo trouvé. Vérifiez que le robot est allumé et sur le même réseau, ou saisissez son adresse (visible dans l’interface Valetudo).',
    de: 'Kein Valetudo-Roboter gefunden. Prüfe, ob der Roboter an und im selben Netzwerk ist, oder gib seine Adresse ein (in der Valetudo-Oberfläche zu sehen).',
    es: 'No se ha encontrado ningún robot Valetudo. Compruebe que el robot está encendido y en la misma red, o escriba su dirección (visible en la interfaz de Valetudo).',
  },
  testTyped: { en: 'typed', fr: 'saisie', de: 'eingegeben', es: 'escrita' },
  testUnreachable: {
    en: 'not answering',
    fr: 'ne répond pas',
    de: 'antwortet nicht',
    es: 'no responde',
  },
  testAuth: {
    en: 'user name or password refused',
    fr: 'identifiants refusés',
    de: 'Zugangsdaten abgelehnt',
    es: 'credenciales rechazadas',
  },
  testBattery: {
    en: 'battery {value} %',
    fr: 'batterie {value} %',
    de: 'Akku {value} %',
    es: 'batería {value} %',
  },
  testMdnsError: {
    en: 'The mDNS search failed ({error}).',
    fr: 'La recherche mDNS a échoué ({error}).',
    de: 'Die mDNS-Suche ist fehlgeschlagen ({error}).',
    es: 'La búsqueda mDNS ha fallado ({error}).',
  },

  // --- Errors of commands and scene actions ----------------------------------
  errorUnknownDevice: {
    en: 'This robot is not known by the Valetudo integration: open the Discover tab.',
    fr: 'Ce robot n’est pas connu de l’intégration Valetudo : ouvrez l’onglet Découverte.',
    de: 'Dieser Roboter ist der Valetudo-Integration nicht bekannt: Öffne den Tab Entdecken.',
    es: 'Este robot no es conocido por la integración Valetudo: abra la pestaña Descubrir.',
  },
  errorUnreachable: {
    en: '{name} does not answer on the local network ({error}).',
    fr: '{name} ne répond pas sur le réseau local ({error}).',
    de: '{name} antwortet nicht im lokalen Netzwerk ({error}).',
    es: '{name} no responde en la red local ({error}).',
  },
  errorRefused: {
    en: '{name} refused the command ({error}).',
    fr: '{name} a refusé la commande ({error}).',
    de: '{name} hat den Befehl abgelehnt ({error}).',
    es: '{name} ha rechazado la orden ({error}).',
  },
  errorAuth: {
    en: '{name} refuses the user name or password: check them in the integration settings.',
    fr: '{name} refuse le nom d’utilisateur ou le mot de passe : vérifiez-les dans les réglages de l’intégration.',
    de: '{name} lehnt Benutzername oder Passwort ab: Prüfe sie in den Einstellungen der Integration.',
    es: '{name} rechaza el usuario o la contraseña: revíselos en los ajustes de la integración.',
  },
  errorUnknownFeature: {
    en: 'Unknown feature: {key}.',
    fr: 'Fonctionnalité inconnue : {key}.',
    de: 'Unbekannte Funktion: {key}.',
    es: 'Función desconocida: {key}.',
  },
  errorNoCapability: {
    en: '{name} cannot do this (Valetudo has no {capability} for this robot).',
    fr: '{name} ne sait pas faire cela (Valetudo n’a pas de {capability} pour ce robot).',
    de: '{name} kann das nicht (Valetudo hat für diesen Roboter kein {capability}).',
    es: '{name} no puede hacer esto (Valetudo no tiene {capability} para este robot).',
  },
  errorNoRooms: {
    en: 'Name at least one room.',
    fr: 'Indiquez au moins une pièce.',
    de: 'Gib mindestens einen Raum an.',
    es: 'Indique al menos una habitación.',
  },
  errorUnknownRoom: {
    en: 'No room “{room}” on the map of {name}. Rooms: {list}.',
    fr: 'Pas de pièce « {room} » sur la carte de {name}. Pièces : {list}.',
    de: 'Kein Raum „{room}“ auf der Karte von {name}. Räume: {list}.',
    es: 'No hay ninguna habitación «{room}» en el mapa de {name}. Habitaciones: {list}.',
  },
  errorPreset: {
    en: '{name} has no preset “{value}”. Presets: {list}.',
    fr: '{name} n’a pas le réglage « {value} ». Réglages : {list}.',
    de: '{name} hat keine Stufe „{value}“. Stufen: {list}.',
    es: '{name} no tiene el ajuste «{value}». Ajustes: {list}.',
  },
  errorCommand: {
    en: 'Unknown command: {command}.',
    fr: 'Commande inconnue : {command}.',
    de: 'Unbekannter Befehl: {command}.',
    es: 'Orden desconocida: {command}.',
  },
  errorConsumable: {
    en: 'Unknown consumable: {key}.',
    fr: 'Consommable inconnu : {key}.',
    de: 'Unbekanntes Verbrauchsteil: {key}.',
    es: 'Consumible desconocido: {key}.',
  },

  // --- Scene event texts --------------------------------------------------------
  attention_dustbin_full: {
    en: 'The dust bin is full.',
    fr: 'Le bac à poussière est plein.',
    de: 'Der Staubbehälter ist voll.',
    es: 'El depósito de polvo está lleno.',
  },
  attention_consumable_depleted: {
    en: 'Consumable worn out: {consumable}.',
    fr: 'Consommable usé : {consumable}.',
    de: 'Verbrauchsteil verschlissen: {consumable}.',
    es: 'Consumible gastado: {consumable}.',
  },
  attention_mop_reminder: {
    en: 'Remember the mop pad.',
    fr: 'Pensez à la serpillière.',
    de: 'Denk an das Wischpad.',
    es: 'Recuerde la mopa.',
  },
  attention_missing_resource: {
    en: 'Something is missing: {message}',
    fr: 'Il manque quelque chose : {message}',
    de: 'Es fehlt etwas: {message}',
    es: 'Falta algo: {message}',
  },
  attention_pending_map_change: {
    en: 'A map change waits for your decision in Valetudo.',
    fr: 'Un changement de carte attend votre décision dans Valetudo.',
    de: 'Eine Kartenänderung wartet in Valetudo auf deine Entscheidung.',
    es: 'Un cambio de mapa espera su decisión en Valetudo.',
  },

  // --- Widgets -----------------------------------------------------------------
  widgetChooseDevice: {
    en: 'Choose a robot in the widget settings.',
    fr: 'Choisissez un robot dans les réglages du widget.',
    de: 'Wähle einen Roboter in den Widget-Einstellungen.',
    es: 'Elija un robot en los ajustes del widget.',
  },
  widgetUnreachable: {
    en: 'Not answering',
    fr: 'Ne répond pas',
    de: 'Antwortet nicht',
    es: 'No responde',
  },
  widgetOffline: {
    en: 'The robot does not answer on the local network.',
    fr: 'Le robot ne répond pas sur le réseau local.',
    de: 'Der Roboter antwortet nicht im lokalen Netzwerk.',
    es: 'El robot no responde en la red local.',
  },
  widgetState: { en: 'State', fr: 'État', de: 'Zustand', es: 'Estado' },
  widgetBattery: { en: 'Battery', fr: 'Batterie', de: 'Akku', es: 'Batería' },
  widgetCharging: { en: 'Charging', fr: 'En charge', de: 'Lädt', es: 'Cargando' },
  widgetArea: { en: 'Cleaned', fr: 'Nettoyé', de: 'Gereinigt', es: 'Limpiado' },
  widgetTime: { en: 'Duration', fr: 'Durée', de: 'Dauer', es: 'Duración' },
  widgetTask: { en: 'Task', fr: 'Tâche', de: 'Aufgabe', es: 'Tarea' },
  widgetError: { en: 'Error', fr: 'Erreur', de: 'Fehler', es: 'Error' },
  widgetErrorUnknown: {
    en: 'See Valetudo',
    fr: 'Voir Valetudo',
    de: 'Siehe Valetudo',
    es: 'Ver Valetudo',
  },
  widgetStart: { en: 'Start', fr: 'Démarrer', de: 'Starten', es: 'Iniciar' },
  widgetResume: { en: 'Resume', fr: 'Reprendre', de: 'Fortsetzen', es: 'Reanudar' },
  widgetPause: { en: 'Pause', fr: 'Pause', de: 'Pause', es: 'Pausa' },
  widgetHome: { en: 'Dock', fr: 'À la base', de: 'Zur Station', es: 'A la base' },
  widgetLocate: { en: 'Locate', fr: 'Localiser', de: 'Orten', es: 'Localizar' },
  widgetCleanRoom: {
    en: 'Clean a room',
    fr: 'Nettoyer une pièce',
    de: 'Raum reinigen',
    es: 'Limpiar habitación',
  },
  widgetRoomField: { en: 'Room', fr: 'Pièce', de: 'Raum', es: 'Habitación' },
  widgetPassesField: { en: 'Passes', fr: 'Passages', de: 'Durchgänge', es: 'Pasadas' },
  roomNumber: { en: 'Room {id}', fr: 'Pièce {id}', de: 'Raum {id}', es: 'Habitación {id}' },
  widgetNoMap: {
    en: 'No map yet: let the robot finish a first cleaning run.',
    fr: 'Pas encore de carte : laissez le robot finir un premier nettoyage.',
    de: 'Noch keine Karte: Lass den Roboter eine erste Reinigung beenden.',
    es: 'Aún no hay mapa: deje que el robot termine una primera limpieza.',
  },
  widgetMapAlt: {
    en: 'Map of the robot: rooms, path, robot and dock',
    fr: 'Carte du robot : pièces, trajet, robot et base',
    de: 'Karte des Roboters: Räume, Weg, Roboter und Station',
    es: 'Mapa del robot: habitaciones, recorrido, robot y base',
  },
  widgetMapCleaning: {
    en: 'Cleaning: {room}',
    fr: 'Nettoyage : {room}',
    de: 'Reinigung: {room}',
    es: 'Limpiando: {room}',
  },
  widgetMapSummary: {
    en: '{rooms} rooms · {area} m² mapped',
    fr: '{rooms} pièces · {area} m² cartographiés',
    de: '{rooms} Räume · {area} m² kartiert',
    es: '{rooms} habitaciones · {area} m² cartografiados',
  },
  widgetTotalArea: {
    en: 'Total cleaned',
    fr: 'Total nettoyé',
    de: 'Gesamt gereinigt',
    es: 'Total limpiado',
  },
  widgetTotalTime: { en: 'Total time', fr: 'Temps total', de: 'Gesamtzeit', es: 'Tiempo total' },
  widgetTotalRuns: { en: 'Runs', fr: 'Nettoyages', de: 'Reinigungen', es: 'Limpiezas' },
  widgetNoConsumables: {
    en: 'This robot reports no consumables.',
    fr: 'Ce robot ne remonte aucun consommable.',
    de: 'Dieser Roboter meldet keine Verbrauchsteile.',
    es: 'Este robot no informa de ningún consumible.',
  },
  widgetReset: { en: 'Reset', fr: 'Remettre à zéro', de: 'Zurücksetzen', es: 'Reiniciar' },
  widgetConsumableField: {
    en: 'Replaced consumable',
    fr: 'Consommable remplacé',
    de: 'Ersetztes Verbrauchsteil',
    es: 'Consumible sustituido',
  },
  badgeReplace: { en: 'Replace', fr: 'À changer', de: 'Ersetzen', es: 'Cambiar' },
  badgeSoon: { en: 'Soon', fr: 'Bientôt', de: 'Bald', es: 'Pronto' },
  badgeOk: { en: 'OK', fr: 'OK', de: 'OK', es: 'OK' },
  remainingPercent: {
    en: '{value} % left',
    fr: '{value} % restants',
    de: '{value} % übrig',
    es: '{value} % restante',
  },
  remainingHours: {
    en: '{value} h left',
    fr: '{value} h restantes',
    de: '{value} Std. übrig',
    es: '{value} h restantes',
  },
  toastStarted: {
    en: '{name} starts cleaning.',
    fr: '{name} démarre le nettoyage.',
    de: '{name} startet die Reinigung.',
    es: '{name} empieza a limpiar.',
  },
  toastPaused: {
    en: '{name} is paused.',
    fr: '{name} est en pause.',
    de: '{name} ist pausiert.',
    es: '{name} está en pausa.',
  },
  toastHome: {
    en: '{name} goes back to its dock.',
    fr: '{name} retourne à sa base.',
    de: '{name} fährt zur Station zurück.',
    es: '{name} vuelve a su base.',
  },
  toastLocate: {
    en: '{name} plays its locate sound.',
    fr: '{name} émet son signal de localisation.',
    de: '{name} spielt seinen Ortungston ab.',
    es: '{name} emite su sonido de localización.',
  },
  toastRoom: {
    en: '{name} goes to clean {room}.',
    fr: '{name} part nettoyer {room}.',
    de: '{name} reinigt jetzt {room}.',
    es: '{name} va a limpiar {room}.',
  },
  toastReset: {
    en: '{consumable}: counter reset.',
    fr: '{consumable} : compteur remis à zéro.',
    de: '{consumable}: Zähler zurückgesetzt.',
    es: '{consumable}: contador reiniciado.',
  },
};

function fill(template, vars) {
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    vars[name] === undefined || vars[name] === null ? match : String(vars[name]),
  );
}

/**
 * @description A runtime text in the four languages.
 * @param {string} key - Message key.
 * @param {object} [vars] - Placeholder values, a value may itself be multi-language.
 * @param {string} [fallback] - Text when the key is unknown (a value Valetudo added later).
 * @returns {{en: string, fr: string, de: string, es: string}} The message.
 */
export function t(key, vars = {}, fallback) {
  return Object.fromEntries(
    LANGUAGES.map((language) => [language, text(key, language, vars, fallback)]),
  );
}

/**
 * @description A runtime text in one language (English when unknown).
 * @param {string} key - Message key.
 * @param {string} language - Language code.
 * @param {object} [vars] - Placeholder values, a value may itself be multi-language.
 * @param {string} [fallback] - Text when the key is unknown (a value Valetudo added later).
 * @returns {string} The text.
 */
export function text(key, language, vars = {}, fallback) {
  const message = MESSAGES[key];
  if (!message) {
    if (fallback !== undefined) {
      return String(fallback);
    }
    throw new Error(`Unknown message ${key}`);
  }
  const lang = LANGUAGES.includes(language) ? language : 'en';
  const resolved = Object.fromEntries(
    Object.entries(vars).map(([name, value]) => [name, pick(value, lang)]),
  );
  return fill(message[lang], resolved);
}

/**
 * @description The name of a feature in one language.
 * @param {string} key - Feature key.
 * @param {string} language - Language code.
 * @returns {string} The name.
 */
export function featureName(key, language) {
  return MESSAGES[key] ? text(key, language) : key;
}

/**
 * @description One language of a value that may be multi-language.
 * @param {*} value - A string, a number or `{ en, fr, ... }`.
 * @param {string} language - Language code.
 * @returns {*} The value in that language.
 */
export function pick(value, language) {
  if (value && typeof value === 'object') {
    return value[language] ?? value.en;
  }
  return value;
}

/**
 * @description Cut a text to a maximum length, with an ellipsis.
 * @param {string} value - The text.
 * @param {number} max - Maximum length.
 * @returns {string} The text, at most `max` characters.
 */
export function truncate(value, max) {
  const string = String(value ?? '');
  return string.length <= max ? string : `${string.slice(0, max - 1).trimEnd()}…`;
}

/**
 * @description Cut every language of a multi-language text.
 * @param {object} message - `{ en, fr, ... }`.
 * @param {number} max - Maximum length.
 * @returns {object} The message.
 */
export function truncateAll(message, max) {
  return Object.fromEntries(
    Object.entries(message).map(([language, value]) => [language, truncate(value, max)]),
  );
}

export const MESSAGE_KEYS = Object.keys(MESSAGES);
export const MESSAGES_FOR_TESTS = MESSAGES;
