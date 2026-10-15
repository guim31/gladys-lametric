# LaMetric

Cette intégration relie les horloges connectées **LaMetric TIME** et
**LaMetric SKY** à Gladys, sur votre réseau local, par l’API locale des
horloges (API v2). Pas de cloud, pas de compte LaMetric dans Gladys : seulement
la clé d’API de chaque horloge.

- Vos scènes écrivent sur les horloges : un texte, avec une icône, un son et
  une priorité.
- La luminosité, le volume, l’écran et le Bluetooth sont des fonctionnalités
  Gladys, à afficher sur un tableau de bord et à piloter depuis les scènes.
- Des boutons poussoirs changent d’application, effacent les notifications,
  et pilotent le chronomètre, le minuteur et la radio.
- Un widget de tableau de bord écrit un message sur l’horloge en deux appuis.

> **Développée sans le matériel : vos retours sont les bienvenus.**
> L’intégration est construite et testée sur des réponses de vraies horloges
> publiées par la bibliothèque python-demetriek et par Home Assistant, pas sur
> une horloge. Dites ce qui marche et ce qui ne marche pas dans les
> [issues](https://github.com/guim31/gladys-lametric/issues).

Cette intégration n’est pas affiliée à LaMetric. LaMetric, LaMetric TIME et
LaMetric SKY sont des marques de leur propriétaire.

## Prérequis

- Gladys Assistant **5.2.0** ou plus récent.
- Une **LaMetric TIME** ou une **LaMetric SKY**, sur le même réseau local que
  Gladys (jusqu’à trois horloges).
- La **clé d’API** de chaque horloge : connectez-vous sur
  [developer.lametric.com](https://developer.lametric.com) avec le compte de
  l’application LaMetric, ouvrez **Devices** et copiez la clé d’API affichée
  pour l’horloge. Chaque horloge a sa propre clé.

## Configuration

1. Dans Gladys, ouvrez **Intégrations** → **Installer depuis GitHub** et
   saisissez `https://github.com/guim31/gladys-lametric` (ou installez
   **LaMetric** depuis le catalogue).
2. Dans **Configuration**, collez la **clé d’API** de la première horloge. Son
   **Adresse** (une adresse IP comme `192.168.1.20`) est facultative : vide,
   Gladys cherche l’horloge sur le réseau. Jusqu’à deux autres horloges
   en dessous.
3. Choisissez l’**Intervalle de rafraîchissement** (30 secondes par défaut) et
   la **Langue des noms de fonctionnalités**, puis enregistrez.
4. Cliquez sur **Tester la connexion** : chaque horloge répond OK, avec son
   modèle et son firmware, ou dit ce qui ne va pas.
5. Ouvrez l’onglet **Découverte** et ajoutez les horloges.

### Adresses et recherche réseau

Les horloges s’annoncent sur le réseau (SSDP). Gladys fait cette recherche
pour l’intégration, qui tourne dans son propre conteneur : elle trouve
l’adresse d’une horloge laissée sans adresse (c’est l’horloge qui accepte la
clé d’API), et suit une horloge dont l’adresse a changé (une nouvelle IP
donnée par la box), par son numéro de série. La recherche se fait quand une
horloge en a besoin, au plus toutes les 5 minutes, et tout de suite depuis
**Scanner** dans l’onglet Découverte ou le bouton **Tester la connexion**, qui liste aussi les
horloges trouvées mais pas encore configurées.

Une horloge qui ne s’annonce pas est jointe à l’adresse saisie. Donnez si
possible une adresse IP fixe à vos horloges dans votre box.

## L’appareil de chaque horloge

Un appareil par horloge, au nom de l’horloge. Chaque fonctionnalité n’apparaît
que si l’horloge l’a :

| Fonctionnalité                                                                  | Ce qu’elle fait                                                                                                      |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Luminosité                                                                      | curseur 0-100 ; la régler coupe la luminosité automatique. Sur le port USB d’un ordinateur, l’horloge s’arrête à 76. |
| Luminosité automatique                                                          | activée : l’horloge suit la lumière de la pièce                                                                      |
| Écran                                                                           | allume ou éteint l’affichage (firmware 3 et plus récent)                                                             |
| Économiseur d'écran                                                             | active ou coupe l’économiseur d’écran de l’application LaMetric (TIME)                                               |
| Volume                                                                          | curseur 0-100 (TIME : la SKY n’a pas de haut-parleur)                                                                |
| Bluetooth                                                                       | active ou coupe le Bluetooth (TIME)                                                                                  |
| Signal Wi-Fi                                                                    | le signal Wi-Fi, en pourcentage                                                                                      |
| Application affichée                                                            | le nom de l’application à l’écran                                                                                    |
| Application suivante, Application précédente                                    | boutons poussoirs : changent l’application à l’écran                                                                 |
| Effacer les notifications                                                       | bouton poussoir : retire les notifications affichées et en attente                                                   |
| Démarrer le chronomètre, Arrêter le chronomètre, Remettre le chronomètre à zéro | boutons poussoirs, si l’application Chronomètre est installée                                                        |
| Démarrer le minuteur, Arrêter le minuteur, Remettre le minuteur à zéro          | boutons poussoirs, si l’application Minuteur est installée (la durée réglée dans l’application)                      |
| Lancer la radio, Arrêter la radio, Station de radio suivante                    | boutons poussoirs, si l’application Radio est installée                                                              |

« Arrêter » met en pause : « Démarrer » reprend de là, « Remettre à zéro »
revient à zéro.

Les horloges sont lues à chaque intervalle de rafraîchissement, par
l’intégration elle-même : les valeurs ne changent dans Gladys que quand elles
changent sur l’horloge, et sont renvoyées toutes les 6 heures sinon. Une
commande est relue aussitôt. Les noms des fonctionnalités sont donnés à la
création de l’appareil ; changer de langue ensuite ne les renomme pas.

## Widget du tableau de bord

Ajoutez le widget **LaMetric** à un tableau de bord. Il montre la luminosité,
le volume et le signal Wi-Fi d’une horloge, son état, l’application à l’écran
et son firmware (et la mise à jour que l’horloge propose, s’il y en a une),
avec quatre boutons :

- **Précédente** et **Suivante** : changent l’application à l’écran ;
- **Message…** : ouvre un formulaire, avec le texte, un code d’icône
  facultatif et un son, et l’affiche sur l’horloge ;
- **Effacer** : retire les notifications.

Dans les réglages du widget, choisissez l’horloge ; vide, le widget montre la
première horloge de la configuration.

## Scènes

L’intégration ajoute deux actions à l’éditeur de scènes, dans la catégorie
**Intégrations**. Les deux agissent sur l’horloge choisie, ou sur toutes les
horloges qui répondent quand le champ LaMetric est vide, et renvoient le
nombre d’horloges qui l’ont fait (`count`).

### Afficher sur la LaMetric

Affiche un texte. Le texte peut contenir des variables de scène (une
température, un nom…).

- **Icône** : le code d’une icône de la
  [galerie LaMetric](https://developer.lametric.com/icons), `i` puis le numéro
  pour une icône fixe (`i2867`), `a` pour une icône animée (`a7956`). Un code
  inconnu est laissé de côté : le texte s’affiche quand même.
- **Son** : un des sons de notification ou des alarmes de l’horloge. Une SKY
  n’a pas de haut-parleur : le texte s’affiche sans son.
- **Priorité** : Information, Avertissement ou Critique. Critique s’affiche
  aussi par-dessus l’économiseur d’écran et la nuit.
- **Nombre de passages** : 1 par défaut ; 0 le garde à l’écran jusqu’à ce que
  quelqu’un appuie sur le bouton de l’horloge.
- **Durée de chaque passage (s)** : vide pour la durée de l’horloge. Un texte
  plus long que l’écran défile quand même.

### Lancer le minuteur de la LaMetric

Lance l’application Minuteur de l’horloge pour les minutes et secondes
choisies. L’application doit être installée sur l’horloge (elle l’est par
défaut).

### Idées de scènes

- **La machine à laver a fini** : quand la puissance de sa prise passe sous
  5 W, **Afficher sur la LaMetric** « Lessive finie », icône `a7956`, son
  « Positif 1 ».
- **On sonne à la porte** : quand la sonnette sonne, afficher « Porte » avec
  le son « Toc toc », priorité Critique, sur toutes les horloges.
- **L’heure du thé** : depuis un bouton du tableau de bord ou une commande
  vocale, **Lancer le minuteur de la LaMetric** pour 4 minutes.
- **La nuit** : à 23 h, régler la **Luminosité** à 5, ou éteindre l’**Écran** ;
  à 7 h, réactiver la **Luminosité automatique**.

## Dépannage

- **« clé d’API refusée »** : recopiez la clé depuis developer.lametric.com →
  Devices ; elle n’appartient qu’à une horloge. Une horloge remise à zéro
  reçoit une nouvelle clé.
- **« introuvable sur le réseau : saisissez son adresse »** : l’horloge ne
  répond pas à la recherche réseau (ou Gladys ne peut pas chercher) : saisissez
  son adresse IP, affichée dans l’application LaMetric (réglages de l’horloge
  → Wi-Fi).
- **« ne répond pas »** : vérifiez que l’horloge est allumée, sur le même
  réseau que Gladys, et que rien ne bloque le port TCP **4343** entre les deux.
- **« cette adresse n’est pas une LaMetric »** : un autre appareil répond à
  cette adresse.
- **Une commande échoue juste après une mise à jour du firmware** : cliquez
  sur **Tester la connexion**, puis sur **Scanner** dans l’onglet
  Découverte : une fonctionnalité apparue (l’interrupteur Écran après le
  firmware 3) fait proposer à Gladys de mettre l’appareil à jour.
- L’intégration ne journalise que l’essentiel (démarrage, connexion, perte et
  retour d’une horloge, actions de l’utilisateur). Pour chaque lecture,
  réglez `LOG_LEVEL=debug` dans les paramètres de l’intégration. Les journaux
  ne montrent jamais une clé d’API.

## Limites

- Réseau local uniquement. Les fonctions cloud de LaMetric (applications du
  store, compte) ne sont pas utilisées.
- Jusqu’à trois horloges.
- L’API de l’appareil ne donne aucun niveau de batterie : il n’y a pas de
  fonctionnalité batterie.
- Le chronomètre, le minuteur et la radio ne donnent pas leur état à
  l’intégration : ce sont des boutons poussoirs, sans état dans Gladys.
- L’intégration ne crée pas d’application sur l’horloge (pas de cadres « My
  Data DIY ») : elle affiche des notifications.
- Les horloges utilisent un certificat HTTPS auto-signé : l’intégration
  l’accepte pour leur adresse. Gardez les horloges sur un réseau de confiance.
- L’API locale de LaMetric n’a pas de limite de requêtes documentée ;
  l’intégration lit chaque horloge deux fois par intervalle de rafraîchissement
  (son état et ses applications), et n’écrit que sur vos commandes.
