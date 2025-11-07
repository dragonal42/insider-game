const path = require('path');
const fs = require('fs');
const express = require('express');
const session = require('express-session');
const expressLayouts = require('express-ejs-layouts');
const http = require('http');
const socketIoModule = require('socket.io');

const GameState = require('./src/gameState');

const app = express();
const server = http.createServer(app);
const io =
  typeof socketIoModule === 'function' && socketIoModule.Server
    ? new socketIoModule.Server(server)
    : typeof socketIoModule === 'function'
    ? socketIoModule(server)
    : new socketIoModule.Server(server);

const defaultWordList = fs
  .readFileSync(path.join(__dirname, 'words', 'famille.csv'), 'utf8')
  .split(/\r?\n/);

const game = new GameState(defaultWordList);

app
  .use(
    session({
      secret: 'session-insider-secret',
      cookie: { maxAge: null },
      resave: false,
      saveUninitialized: false,
    }),
  )
  .use('/static', express.static(path.join(__dirname, 'public')))
  .use(expressLayouts)
  .use(express.urlencoded({ extended: true }));

app
  .set('view engine', 'ejs')
  .set('layout', 'layouts/layout');

app.get('/', (req, res) => {
  res.render('welcome.ejs', { players: game.getVisiblePlayers() });
});

app.get('/adminPlayer', (req, res) => {
  res.render('adminPlayer.ejs', { players: game.players });
});

app.get('/deletePlayer', (req, res) => {
  if (req.query.player) {
    game.deletePlayer(req.query.player);
  }

  res.redirect('/adminPlayer');
});

app.post('/addPlayer', (req, res) => {
  const { player, admin } = req.body;
  if (player) {
    game.addPlayer(player, admin === 'on');
  }

  res.redirect('/adminPlayer');
});

app.post('/setWord', (req, res) => {
  game.setWord(req.body.word);
  res.json('ok');
});

app.post('/game', (req, res) => {
  req.session.player = req.body.player;
  res.redirect('/game');
});

app.get('/game', (req, res) => {
  if (!req.session.player) {
    res.redirect('/');
    return;
  }

  const player = game.getPlayer(req.session.player);
  if (!player) {
    res.redirect('/');
    return;
  }

  res.render('board.ejs', {
    player,
    status: game.status,
    resultVote1: game.resultVote1,
    resultVote2: game.resultVote2,
  });
});

io.on('connection', (socket) => {
  socket.join('game');

  socket.on('newPlayer', () => {
    const status = game.trackPlayerOnline();
    io.in('game').emit('playerStatusUpdate', status);
  });

  socket.on('disconnect', () => {
    const status = game.trackPlayerOffline();
    io.in('game').emit('playerStatusUpdate', status);
  });

  socket.on('resetGame', () => {
    game.stopCountdown();
    const players = game.randomizeRoles();
    game.setWord('');
    game.status = 'role';
    io.in('game').emit('newRole', { players });
  });

  socket.on('revealWord', () => {
    game.status = 'word';
    io.in('game').emit('revealWord', {
      players: game.players,
      word: game.word,
    });
  });

  socket.on('wordFound', () => {
    game.stopCountdown();
    game.status = 'vote1';
    io.in('game').emit('wordFound');
  });

  socket.on('displayVote1', () => {
    game.resetVotes(1);
    game.status = 'vote1';
    io.in('game').emit('displayVote1');
  });

  socket.on('displayVote2', () => {
    game.resetVotes(2);
    game.status = 'vote2';
    io
      .in('game')
      .emit('displayVote2', game.players.filter((player) => player.role !== game.roles.gameMaster));
  });

  socket.on('vote1', (object) => {
    if (!object || !object.player) {
      return;
    }

    game.recordVote(1, object.player, object.vote);

    if (game.everyoneHasVoted(1)) {
      const result = game.tallyVote1();
      game.status = 'vote2';
      io.in('game').emit('vote1Ended', result);
    }
  });

  socket.on('vote2', (object) => {
    if (!object || !object.player) {
      return;
    }

    game.recordVote(2, object.player, object.vote);

    if (game.everyoneHasVoted(2)) {
      const result = game.tallyVote2();
      game.status = 'end';
      io.in('game').emit('vote2Ended', result);
    }
  });

  socket.on('startGame', () => {
    game.stopCountdown();
    game.status = 'in_progress';
    io.in('game').emit('startGame');

    game.startCountdown((counter) => {
      io.in('game').emit('countdownUpdate', counter);
    });
  });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  /* eslint-disable no-console */
  console.log(`Server listening on port ${PORT}`);
  /* eslint-enable no-console */
});
