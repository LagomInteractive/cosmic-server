Find the latest up to date version of this text at
outlaws.ygstr.com/todo

## About TODO
* [/] Not started
* [*] In progress
* [?] Done but not tested
* [X] Done and working

# General

* [X] Add outdated client warning
* [X] Update to new card style (Game)
* [X] Sacrifice
    * [?] Lunar: gives you 2 extra mana
    * [?] Solar: heals +2 to all units at end of turn (NOW IS BEFORE)
    * [?] Zenith: Draw 1 extra card each turn
    * [X] Nova: All units get +1 attack at the beginning of round
* [X] Sacrifice UI
* [X] Choose deckID UI
* [X] Fix 11 mana UI
* [X] Passive system
    * [X] Necromancer: Every 5 killed or sacrificed, spawns 3/3
    * [X] Mercenary: Every 5 turns copy a random card from opponent
* [X] Minion look (Not be a card, visual taunt)
* [X] Animate minion damage
* [X] Particle effects during gameplay
* [X] Sound effects for gameplay
* [X] Let bot use Spell cards
* [X] Show minion's origin card on battlefield
* [X] Complete rewrite of card hand layout (Circular)
    * [X] Show enemy hand
* [*] Game menu
    * [*] Login system
    * [/] Start a game & Choose a deck
    * [/] Deck builder (Game)
    * [/] Show online users
    * [/] Settings (Show password)

* [/] Rarities (Website, Card editor, Game)
* [/] Tips (Website)
* [/] Tips (Game)
* [/] Make dragging card sway
* [/] Show enemy hand animate when they view cards
* [/] Mobile support
* [/] XP progression
* [/] Prevent player from joing a new game if they are in one on another device

# Bugs
* [X] Shelly: damageEveryOpponent 
* [X] Shelly vs. Shelly Loop
* [X] Sacrifice UI colors doesnt update (Unity bugg?) 
* [X] Player 2 can attack on player 1's turn.

## Card events

* [X] Target battlecry
* [X] Battlecry
* [X] everyRound
* [X] OnDeath
* [X] OnAttacked

## Card functions

* [X] damageTarget
* [X] damageRandomAlly
* [X] damageEveryOpponent
* [X] healRandomAlly
* [X] healEveryAlly
* [X] spawnMinion
* [X] gainMana
* [X] drawAmountCards
* [X] drawCard
* [X] damageTargetUnit
* [?] damageOpponent
* [X] damageRandomOpponent
* [X] damageRandomEnemyUnit
* [X] damageAllUnits
* [X] damageRandomUnit
* [X] changeTargetAttack 
* [X] healPlayer
* [X] healTarget
* [X] changeTargetMaxHp
* [X] damageRandomAllyUnit
* [X] changeAllyUnitsMaxHp
* [X] damageRandomAnything

## Low prio
 * Security: Hide opponent card from client on drawCard events 

