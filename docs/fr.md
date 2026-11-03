# Valetudo

## Présentation

Cette intégration pilote les aspirateurs robots sous **Valetudo** (valetudo.cloud), le micrologiciel libre qui remplace le cloud du fabricant, par son API REST locale officielle : aucun compte, rien ne sort de votre réseau. Chaque robot devient un appareil Gladys avec les fonctionnalités natives d’aspirateur robot (état, nettoyage, retour à la base, batterie), ses réglages d’aspiration et d’eau et la durée de vie restante de ses consommables. Les actions de scène nettoient des pièces par leur nom et pilotent le robot ; les déclencheurs signalent le début et la fin d’un nettoyage, une erreur ou un besoin d’intervention. Trois widgets montrent le robot, sa carte en direct et son entretien.

Sans lien avec le projet Valetudo. **Pas encore testée sur un vrai robot** : les requêtes suivent l’API officielle de Valetudo 2026.10 ; vos retours sont les bienvenus.

## Prérequis

- Gladys Assistant 5.3.0 ou plus récent.
- Un aspirateur robot sous Valetudo, sur le même réseau que Gladys, dont la page Valetudo s’ouvre dans un navigateur.
- Idéalement, une adresse IP fixe pour le robot dans votre box. Le nettoyage par pièce demande un robot qui découpe la carte en pièces, avec une carte enregistrée.

## Configuration

1. Installez l’intégration depuis le store, puis ouvrez sa configuration.
2. Laissez **Trouver les robots automatiquement (mDNS)** activé. Pour un robot sur un autre réseau, saisissez son adresse (IP ou nom, avec `:port` si besoin) dans **Adresses des robots**.
3. Si l’authentification HTTP est activée dans Valetudo (Paramètres → Connectivité → Auth settings), saisissez le même **nom d’utilisateur** et le même **mot de passe**.
4. Choisissez la **langue des textes des appareils** et cliquez sur **Rechercher et tester les robots** : le message liste chaque robot trouvé, avec son adresse et sa batterie.
5. Ouvrez l’onglet **Découverte** et ajoutez vos robots.

## Utilisation

Chaque robot reçoit ces fonctionnalités, selon ce que Valetudo propose pour lui :

| Fonctionnalité   | Type                      | Rôle                                                                         |
| ---------------- | ------------------------- | ---------------------------------------------------------------------------- |
| État             | aspirateur robot, capteur | Arrêté, en cours, en pause, erreur, retour à la base, en charge, sur la base |
| Nettoyage        | aspirateur robot, liste   | Arrêt, Nettoyer (démarre ou reprend), Cartographier (si le robot le permet)  |
| Retour à la base | aspirateur robot, bouton  | Renvoie le robot sur sa base                                                 |
| Batterie         | batterie, %               | Niveau de charge                                                             |
| Aspiration       | liste                     | Les réglages d’aspiration du robot                                           |
| Eau              | liste                     | Les réglages d’eau (robots laveurs)                                          |
| Mode             | liste                     | Aspiration, lavage, aspiration et lavage… (robots qui le proposent)          |
| Consommable      | entretien, %              | Durée de vie restante de chaque brosse, filtre, serpillière… qui la remonte  |

Valetudo envoie les changements au moment où ils arrivent ; consommables et statistiques sont relus toutes les quelques minutes.

### Widgets du tableau de bord

- **Aspirateur robot** : état, batterie, surface et durée du nettoyage en cours, aspiration et eau, message d’erreur ; boutons **Démarrer** / **Pause** / **Reprendre**, **À la base**, **Localiser** et **Nettoyer une pièce** (choix de la pièce et du nombre de passages).
- **Carte du robot** : la carte en direct dessinée par l’intégration (pièces en couleurs, murs, trajet, robot en bleu, base en vert, murs virtuels et zones interdites en rouge), la pièce en cours en ambre.
- **Entretien du robot** : surface, temps et nombre de nettoyages au total, chaque consommable du plus usé au moins usé (pastille **À changer** sous 10 %, **Bientôt** sous 25 %), et **Remettre à zéro** après un remplacement.

![Widgets Valetudo : robot, carte et entretien d’un robot qui nettoie une pièce (illustration générée, pas une capture d’écran)](https://raw.githubusercontent.com/William-De71/gladys-valetudo/main/docs/assets/widgets.fr.png)

### Scènes

Actions : **Nettoyer des pièces avec un aspirateur robot** (noms des pièces donnés dans Valetudo, sans tenir compte des accents ni des majuscules, ou numéros, séparés par des virgules ; nombre de passages ; aspiration et eau réglées d’abord si choisies ; renvoie les pièces envoyées) et **Piloter un aspirateur robot** (démarrer ou reprendre, pause, arrêter, retour à la base, localiser, vider le bac dans la station, laver ou sécher la serpillière à la station).

Déclencheurs : **nettoyage démarré**, **nettoyage terminé** (avec la surface en m² et la durée en minutes), **erreur** (avec le message du robot), **demande votre attention** (bac à poussière plein, consommable usé, rappel serpillière, élément manquant, changement de carte à accepter ; filtre par motif), **ne répond plus** et **répond de nouveau**. Le nom du robot est toujours une variable.

Exemples :

- Quand tout le monde quitte la maison → nettoyer « Cuisine, Salon » en deux passages.
- Quand le nettoyage est terminé → envoyer « {{triggerEvent.data.area_m2}} m² nettoyés » sur votre téléphone.
- Quand le robot demande votre attention parce que le bac est plein → faire clignoter la lampe de l’entrée.

## Dépannage

- **Aucun robot trouvé** : vérifiez que sa page Valetudo s’ouvre à son adresse depuis un autre appareil, puis saisissez cette adresse dans la configuration et utilisez **Rechercher et tester les robots**. Le mDNS ne traverse ni les VLAN ni les réseaux invités.
- **« refuse le nom d’utilisateur ou le mot de passe »** : les identifiants ne correspondent pas à l’authentification HTTP de Valetudo.
- **« ne sait pas faire cela »** : Valetudo n’a pas cette capacité pour ce robot (fonction de station, pièces, cartographie) ; le message la nomme.
- **Pas de carte dans le widget** : le robot n’a pas encore de carte enregistrée ; laissez-le finir un premier nettoyage complet.
- Pour signaler un bug, donnez les versions de Gladys, de l’intégration et de Valetudo, le modèle du robot, le message du bouton de test et les logs (ajoutez `DEBUG=gladys-integration-sdk` en mode développeur) : [ouvrir une issue](https://github.com/William-De71/gladys-valetudo/issues).
