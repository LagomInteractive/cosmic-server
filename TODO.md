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
* [X] Rarities
    * [X] Editor
    * [X] Website
    * [X] Game
* [X] Menu system
    * [X] Login system
    * [X] Main menu and features
    * [X] Start a game & Choose a deck
* [X] Searching game timer
* [X] Remake AttackLine to not use hitboxes
* [X] Basic Mobile support
* [X] Make it so you can sacrifice units even if that have done damage.
* [X] Deck builder (Game)
* [X] Card packs
  * [X] Key generator
  * [X] In game redeem and store
* [X] Redmeed card packs in store
* [X] Round timer in game
* [X] Make the correct character appear in gameplay
* [X] Ability to restart after game end
* [X] Game and Menu music
* [X] Card opening
* [X] Tips (Website)
* [X] Tips (Game)
* [*] XP progression and Pack rewards on level up
* 
* [X] Prevent players to matchmake with the same account on different clients
* [/] Tab and Enter to help with Login
* [/] [Maybe] Make dragging card sway
* [/] [Maybe] Show online users ingame
* [/] [Maybe] Show enemy hand animate when they view cards

# XP System

XP Rewards

| Action                | XP Reward |
|-----------------------|-----------|
| Win a game            | 500       |
| Round played          | 5         |
| Kill a unit           | 30        |
| Gain sacrifice buff   | 100       |
| Achive passive reward | 25        |

Level ladder

| Level | XP to level up |
|-------|----------------|
| 1     | 100            |
| 2     | 250            |
| 3     | 500            |
| 4     | 750            |
| 5+    | 1000           |


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

