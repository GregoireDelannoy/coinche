const express = require('express');
const deepcopy = require('deepcopy');
var app = express();
var http = require('http').createServer(app);
var io = require('socket.io')(http);

app.use(express.static('public'));

var state = null;
var history = null;
var sockets = null;
var gameId = null;

var games = {};

const CARDS = [ '10_of_clubs.png', '10_of_diamonds.png', '10_of_hearts.png', '10_of_spades.png', '7_of_clubs.png', '7_of_diamonds.png', '7_of_hearts.png', '7_of_spades.png', '8_of_clubs.png', '8_of_diamonds.png', '8_of_hearts.png', '8_of_spades.png', '9_of_clubs.png', '9_of_diamonds.png', '9_of_hearts.png', '9_of_spades.png', 'ace_of_clubs.png', 'ace_of_diamonds.png', 'ace_of_hearts.png', 'ace_of_spades.png', 'jack_of_clubs2.png', 'jack_of_diamonds2.png', 'jack_of_hearts2.png', 'jack_of_spades2.png', 'king_of_clubs2.png', 'king_of_diamonds2.png', 'king_of_hearts2.png', 'king_of_spades2.png', 'queen_of_clubs2.png', 'queen_of_diamonds2.png', 'queen_of_hearts2.png', 'queen_of_spades2.png'];

function sortCards(deck){
    var newDeck = [];
    for (const color of ['hearts', 'clubs', 'spades', 'diamonds']){
        for (const val of ['ace', '10', 'king', 'queen', 'jack', '9', '8', '7']){
            for(let i = 0; i < deck.length; i++){
                if(deck[i].startsWith(val + '_of_' + color)){
                    newDeck.push(deck[i]);
                }
            }
        }
    }
    return newDeck;
}

function cardToPoints(card, atout){
    if(card.indexOf(atout) > -1){
        if (card.startsWith('jack')){
            return 20;
        } else if (card.startsWith('9')){
            return 14;
        } 
    }
    if (card.startsWith('ace')){
        return 11;
    } else if (card.startsWith('10')){
        return 10;
    } else if (card.startsWith('king')){
        return 4;
    } else if (card.startsWith('queen')){
        return 3;
    } else if (card.startsWith('jack')){
        return 2;
    }
    return 0;
}

function cardsToPoints(cards, atout){
    var res = 0;
    cards.forEach(c => res += cardToPoints(c, atout));
    return res;
}

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        let j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

function saveState(){
    var save = deepcopy(state);
    history.push(save);
    if(history.length > 10){
        history.shift();
    }
}

function restoreState(){
    state = history.pop()
    games[gameId].state = state;
}

function resetState(){
    saveState();
    state.table = [null, null, null, null];
    state.plis = [];
    state.atout = null;
    state.players.forEach(player => {
        player.deck = [];
        player.stack = [];
        player.teamPoints = 0;
    });
}

function giveRandom(){
    var array = [];
    for(var i = 0; i < 32; i++){
        array.push(i);
    }
    shuffle(array);
    for(var i = 0; i < 32; i++){
        var player = Math.floor(i / 8);
        console.log('i:', i, ' player: ', player, ' card index:', array[i]);
        state.players[player].deck.push(CARDS[array[i]]);
    }
}

function giveFromState(fromState){
    var cards = [];
    for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 4; j++) {
            cards.push(fromState.plis[i][j]);
        }
    }
    var cut = Math.floor(Math.random * 32);
    var after = cards.splice(cut);
    var cutted = after.concat(cards);
    if(cutted.length != 32){
        console.error("FATAAAAL");
        broadcast('gameError', 'Erreur serveur : essayé de faire une donne avec le mauvais nombre de cartes...')
        return;
    } else {
        console.log('cut:', cutted);
    }
    for (let i = 0; i < 4; i++) {
        state.players[i].deck = state.players[i].deck.concat(cutted.splice(0, 3));
    }
    for (let i = 0; i < 4; i++) {
        state.players[i].deck = state.players[i].deck.concat(cutted.splice(0, 3));
    }
    for (let i = 0; i < 4; i++) {
        state.players[i].deck = state.players[i].deck.concat(cutted.splice(0, 2));
    }
}

function sortAllDecks(){
    for(let i = 0; i < 4; i++){
        state.players[i].deck = sortCards(state.players[i].deck);
    }
}

function resetGame(){
    resetState();
    history = [];
    giveRandom();

    broadcast('gameStart');
}

function checkId(id){
    return [0, 1, 2, 3].includes(id)
}

function handleStart(pseudo, id, socket){
    console.log('Handling start with pseudo, id', pseudo, id);
    if(pseudo && checkId(id)){
        state.players[id].pseudo = pseudo;
        socket.emit('setDeck', state.players[id].deck);
        socket.emit('setTable', state.table);
        computePoints();
    } else {
        socket.emit('gameError', 'Invalid pseudo or id');
    }
}

function computePoints(){
    var team02 = cardsToPoints(state.players[0].stack.concat(state.players[2].stack), state.atout);
    state.players[0].teamPoints = team02;
    state.players[2].teamPoints = team02;
    var team13 = cardsToPoints(state.players[1].stack.concat(state.players[3].stack), state.atout);
    state.players[1].teamPoints = team13;
    state.players[3].teamPoints = team13;
    broadcast('setPseudos', [
        state.players[0].pseudo,
        state.players[1].pseudo,
        state.players[2].pseudo,
        state.players[3].pseudo,
    ], [
        'Emplacement: 0, Points : ' + team02,
        'Emplacement: 1, Points : ' + team13,
        'Emplacement: 2, Points : ' + team02,
        'Emplacement: 3, Points : ' + team13,
    ]);
    broadcast('setAtout', state.atout);
}

function handleGrabTableCards(id, socket){
    if(!checkId(id)){
        socket.emit('gameError', 'Invalid ID');
        return;
    }
    if(state.table.indexOf(null) > -1){
        socket.emit('gameError', 'Impossible de prendre les cartes si la table n\'est pas pleine');
        return;
    }
    saveState();
    state.plis.push(deepcopy(state.table));
    for (var i = 0; i < 4; i++){
        state.players[id].stack.push(state.table[i]);
    }
    computePoints();
    state.table = [null, null, null, null];
    broadcast('setTable', state.table);
}

function handleSetAtout(atout){
    state.atout = atout;
    computePoints();
}

function handlePlay(index, id, socket){
    if(!checkId(id)){
        socket.emit('gameError', 'Invalid ID');
        return;
    }
    if (state.table[id] == null){
        saveState();
        var playedCard = state.players[id].deck.splice(index, 1);
        if (playedCard != null && playedCard.length == 1 && playedCard[0]){
            console.log('Player ' + id + ' put card: ' + playedCard[0]);
            socket.emit('setDeck', state.players[id].deck);
            state.table[id] = playedCard[0];
            broadcast('setTable', state.table);
            computePoints();
        } else {
            socket.emit('gameError', 'Pas de carte dans le deck à cet emplacement')
        }
    } else {
        socket.emit('gameError', 'Carte déjà posée');
    }
}

function handleShowLatestPli(socket){
    if(state.plis.length > 0){
        socket.emit('showPli', state.plis[state.plis.length - 1], state.plis.length - 1);
    } else {
        socket.emit('gameError', 'Pas de plis');
    }
}

function handleShowPli(index, socket){
    if(index > -1 || index < state.plis.length){
        socket.emit('showPli', state.plis[index], index);
    } else {
        socket.emit('gameError', 'Pas de plis pour l\'index: ' + index);
    }
}

function handleReset(){
    resetGame();
}

function handleUndo(){
    restoreState();
    broadcast('gameStart');
}

function handleStartNewGame(socket){
    if (state.plis.length != 8) {
        console.log(state.plis.length);
        console.dir(state.plis);
        socket.emit('gameError', 'Toutes les cartes doivent être jouées et prises pour redistribuer. (Utiliser "Annuler action" pour refaire une donne.)');
    } else {
        var lastState = deepcopy(state);
        resetState();
        giveFromState(lastState);
        sortAllDecks();
        broadcast('gameStart');
    }
}

function initGame(socket){
    return {
        'history': [],
        'state': {
            'players': [
                {'pseudo': '', teamPoints: 0, deck: [], stack: []},
                {'pseudo': '', teamPoints: 0, deck: [], stack: []},
                {'pseudo': '', teamPoints: 0, deck: [], stack: []},
                {'pseudo': '', teamPoints: 0, deck: [], stack: []},
            ],
            'table': [null, null, null, null],
            'plis': [],
            'atout': null,
        },
        'sockets': [socket],
        'ctime': (Date.now() / 360000),
    }
}

function broadcast(...args){
    for (let index = 0; index < sockets.length; index++) {
        sockets[index].emit(...args);
    }
}

function selectGame(socket){
    gameId = socket.request.headers.referer.split('game.html?')[1];
    if(gameId){
        if (!games.hasOwnProperty(gameId)){
            console.log('Init new game with id: ' + gameId);
            games[gameId] = initGame(socket);
            sockets = games[gameId].sockets;
            history = games[gameId].history;
            state = games[gameId].state;
            resetGame();
        } else {
            sockets = games[gameId].sockets;
            history = games[gameId].history;
            state = games[gameId].state;
        }
        if (!sockets.includes(socket)){
            sockets.push(socket);
        }
        return true;
    } else {
        socket.emit('gameError', 'Game ID is not right');
        return false;
    }
}

function purgeGames(){
    for (entry of Object.keys(games)){
        if(games[entry]['ctime'] < (Date.now() / 360000) - 12){
            console.log('Game active for more than 12 hours, deleting: ' + entry);
            delete games[entry];
        }
    }
}

io.on('connection', function(socket){
    console.log(socket.request.headers.referer);
    purgeGames();
    socket.on('showLatestPli', () => {selectGame(socket) && handleShowLatestPli(socket);});
    socket.on('showPli', (index) => {selectGame(socket) && handleShowPli(index, socket);});
    socket.on('start', (pseudo, id) => {selectGame(socket) && handleStart(pseudo, id, socket);});
    socket.on('grabTableCards', (id) => {selectGame(socket) && handleGrabTableCards(id, socket);});
    socket.on('play', (id, index) => {selectGame(socket) && handlePlay(id, index, socket);});
    socket.on('reset', () => {selectGame(socket) && handleReset()});
    socket.on('startNewGame', () => {selectGame(socket) && handleStartNewGame(socket);});
    socket.on('undo', () => {selectGame(socket) && handleUndo()});
    socket.on('setAtout', (atout) => {selectGame(socket) && handleSetAtout(atout)});
});

http.listen(3000, function(){
  console.log('listening on *:3000');
});