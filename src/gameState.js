const GAME_MASTER_ROLE = 'Maître du jeu';
const TRAITOR_ROLE = 'Traître';
const DEFAULT_ROLE = 'Citoyen';

function createPlayer(name, { permission = null, isGhost = false } = {}) {
  return {
    name,
    role: DEFAULT_ROLE,
    vote1: null,
    vote2: null,
    nbVote2: 0,
    isGhost,
    permission,
  };
}

class GameState {
  constructor(wordList = []) {
    this.wordList = wordList.filter((word) => word && word.trim().length > 0);
    this.settings = { traitorOptional: true };

    this.players = [
      createPlayer('Hélène'),
      createPlayer('Manu', { permission: 'admin' }),
    ];

    this.online = 0;
    this.status = '';
    this.word = '';
    this.resultVote1 = null;
    this.resultVote2 = null;
    this.countdown = null;
  }

  get roles() {
    return {
      gameMaster: GAME_MASTER_ROLE,
      traitor: TRAITOR_ROLE,
      citizen: DEFAULT_ROLE,
    };
  }

  getVisiblePlayers() {
    return this.players.filter((player) => !player.isGhost);
  }

  getPlayer(name) {
    return this.players.find((player) => player.name === name) || null;
  }

  addPlayer(name, isAdmin = false) {
    const cleanedName = typeof name === 'string' ? name.trim() : '';
    if (!cleanedName) {
      return;
    }

    const existingPlayerIndex = this.players.findIndex((player) => player.name === cleanedName);
    if (existingPlayerIndex !== -1) {
      this.players.splice(existingPlayerIndex, 1);
    }

    this.players.push(
      createPlayer(cleanedName, {
        permission: isAdmin ? 'admin' : null,
      }),
    );
  }

  deletePlayer(name) {
    this.players = this.players.filter((player) => player.name !== name);
  }

  trackPlayerOnline() {
    this.online += 1;
    return this.getPlayerStatus();
  }

  trackPlayerOffline() {
    this.online = Math.max(0, this.online - 1);
    return this.getPlayerStatus();
  }

  getPlayerStatus() {
    const humanPlayers = this.getVisiblePlayers();
    const offline = Math.max(humanPlayers.length - this.online, 0);

    return {
      online: this.online,
      offline,
    };
  }

  chooseRandomWord() {
    if (this.wordList.length === 0) {
      return '';
    }

    const index = Math.floor(Math.random() * this.wordList.length);
    return this.wordList[index].trim();
  }

  setWord(value) {
    const newWord = typeof value === 'string' && value.trim().length > 0 ? value.trim() : this.chooseRandomWord();
    this.word = newWord;
    return this.word;
  }

  randomizeRoles() {
    this.resetGameState();

    const eligiblePlayers = this.shuffle(this.getVisiblePlayers().slice());
    this.assignRole(GAME_MASTER_ROLE, eligiblePlayers);
    this.addGhostPlayerIfNeeded();

    const traitorCandidates = this.shuffle(this.players.filter((player) => !player.isGhost && player.role === DEFAULT_ROLE));
    this.assignRole(TRAITOR_ROLE, traitorCandidates);

    this.players.sort((playerA, playerB) => {
      if (playerA.isGhost && !playerB.isGhost) {
        return 1;
      }
      if (!playerA.isGhost && playerB.isGhost) {
        return -1;
      }
      return playerA.name.localeCompare(playerB.name);
    });

    return this.players;
  }

  resetGameState() {
    this.stopCountdown();
    this.removeGhostPlayer();

    this.players.forEach((player) => {
      /* eslint-disable no-param-reassign */
      player.role = DEFAULT_ROLE;
      player.vote1 = null;
      player.vote2 = null;
      player.nbVote2 = 0;
      /* eslint-enable no-param-reassign */
    });

    this.word = '';
    this.status = '';
    this.resultVote1 = null;
    this.resultVote2 = null;
  }

  assignRole(role, candidates = []) {
    const player = candidates.find((candidate) => candidate.role === DEFAULT_ROLE);
    if (player) {
      player.role = role;
    }
  }

  shuffle(source) {
    const array = source.slice();
    for (let i = array.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  addGhostPlayerIfNeeded() {
    if (!this.settings.traitorOptional || this.getGhostPlayer()) {
      return;
    }

    this.players.push(
      createPlayer('Pas de Traître', {
        isGhost: true,
      }),
    );
  }

  removeGhostPlayer() {
    this.players = this.players.filter((player) => !player.isGhost);
  }

  getGhostPlayer() {
    return this.players.find((player) => player.isGhost) || null;
  }

  resetVotes(voteNumber) {
    this.players.forEach((player) => {
      if (voteNumber === 1) {
        player.vote1 = null;
      } else if (voteNumber === 2) {
        player.vote2 = null;
        player.nbVote2 = 0;
      }
    });
  }

  recordVote(voteNumber, playerName, voteValue) {
    const player = this.getPlayer(playerName);
    if (!player) {
      return;
    }

    if (voteNumber === 1) {
      player.vote1 = voteValue;
    } else if (voteNumber === 2) {
      player.vote2 = voteValue;
    }
  }

  everyoneHasVoted(voteNumber) {
    return this.players.every((player) => {
      if (player.isGhost) {
        return true;
      }

      if (voteNumber === 1) {
        return player.vote1 !== null && player.vote1 !== undefined;
      }

      if (voteNumber === 2) {
        return player.vote2 !== null && player.vote2 !== undefined;
      }

      return false;
    });
  }

  tallyVote1() {
    const result = { up: 0, down: 0 };
    this.players.forEach((player) => {
      if (player.isGhost) {
        return;
      }
      if (player.vote1 === '1' || player.vote1 === 1) {
        result.up += 1;
      } else if (player.vote1 !== null) {
        result.down += 1;
      }
    });

    this.resultVote1 = result;
    return result;
  }

  tallyVote2() {
    this.players.forEach((player) => {
      player.nbVote2 = 0;
    });

    this.players.forEach((player) => {
      if (!player.vote2) {
        return;
      }

      const voteTarget = this.getPlayer(player.vote2);
      if (voteTarget) {
        voteTarget.nbVote2 += 1;
      }
    });

    const votePlayers = this.players
      .filter((player) => player.role !== GAME_MASTER_ROLE)
      .sort((playerA, playerB) => playerB.nbVote2 - playerA.nbVote2);

    const topVote = votePlayers[0] || null;
    const secondVote = votePlayers[1] || null;
    const ghostPlayer = this.getGhostPlayer();

    const hasTraitor = !ghostPlayer || ghostPlayer.role !== TRAITOR_ROLE;
    const hasWon =
      Boolean(topVote && topVote.role === TRAITOR_ROLE) &&
      (!secondVote || secondVote.nbVote2 < topVote.nbVote2);

    const result = {
      hasWon,
      voteDetail: votePlayers,
      hasTraitor,
    };

    this.resultVote2 = result;
    return result;
  }

  startCountdown(tickCallback) {
    let counter = 300;

    this.stopCountdown();

    this.countdown = setInterval(() => {
      counter -= 1;
      if (counter <= 0) {
        this.stopCountdown();
      }
      tickCallback(counter);
    }, 1000);
  }

  stopCountdown() {
    if (this.countdown) {
      clearInterval(this.countdown);
      this.countdown = null;
    }
  }
}

module.exports = GameState;
