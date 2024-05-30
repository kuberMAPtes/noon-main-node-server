//npm init -y
//npm install nodemon (안하면 node server.js 로 실행)
//npm install express 
//npm install socket.io

// 몽고 DB 연결
var mongoose = require('mongoose');
const mongooseFunctionSJ = require('./mongoDB_lib_SJ');

var modelChat; // 모델(=테이블?)임
async function initialSetting(){
    modelChat = await mongooseFunctionSJ.mongooseSetup();
}

initialSetting();

// *** 복붙하기 위한 임시 코드 ***
async function temp(){

await mongooseFunctionSJ.mongooseWrite(modelChat, chat);
await mongooseFunctionSJ.mongooseReadOne(modelChat, chat);
await mongooseFunctionSJ.mongooseReadAll(modelChat);
await mongooseFunctionSJ.mongooseUpdate(modelChat, chat);
await mongooseFunctionSJ.mongooseDelete(modelChat, chat);

mongoose.connection.close();
}

// 웹서버 개설
const express = require('express');
const app = express();

const port = 8087;
const server = app.listen(port, function() {
    console.log('Listening on '+port);
});

// socketIO 개설(?)
const SocketIO = require('socket.io');
const io = SocketIO(server, {
    // node 서버와 웹서버가 다를 경우 cors 문제 생김
    cors: {
        origin: "http://localhost:3000",
    },
    path: '/socket.io'
});

io.on('connection', async function (socket) {

    console.log(socket.id, ' connected...');

    // return public room names by comparing sids and rooms
    function publicRooms(){
        // 현재 소켓 안의 adapter 정보
        const { 
            adapter : { sids, rooms } 
        } = socket;

        console.log("-------------------------------------------------- sids",sids)
        console.log("-------------------------------------------------- rooms",rooms)

        // 현재 소켓에서 publicRooms 조회
        const publicRooms = [];
        rooms.forEach((_,key)=>{
            if(sids.get(key) === undefined) {
                publicRooms.push(key);
            }
        })

        console.log("-------------------------------------------------- publicRooms", publicRooms)

        return publicRooms;
    }

    // show initial chatRoom when user join in 
    socket.on("init_chatRoom", (done) => {
        const currentChatRoomAndPersonnel = {
            publicRooms : publicRooms(),
            Personnel : Array.from(socket.adapter.sids)
        }

        console.log("currentChatRoomAndPersonnel", currentChatRoomAndPersonnel)

        done(currentChatRoomAndPersonnel);
    })

    // open new chat Room
    socket.on("enter_room", async (roomName,done)=>{
        console.log('🎴 입장한 roomName', roomName);
        console.log('🎴 해당 socket 이 입장한 rooms 목록', socket.rooms); 

        socket.join(roomName);
        io.emit("room_name", publicRooms());
        done(roomName);

        // show entire chat room member and number
        const roomInfo = {
            personnel: socket.adapter.rooms.get(roomName).size, 
            members: Array.from(socket.adapter.rooms.get(roomName)),
            sids: Array.from(socket.adapter.sids)
        }
        console.log('🎴 해당 rooms 에 대한 정보 roomInfo',roomInfo);
        
        socket.emit('room_info', roomInfo);

        if(roomName !== null){
            io.to(roomName).to(socket.id).emit("welcome_event",`${socket.id} 님이 room ${roomName}에 입장하셨습니다. (입장시간 : ${socket.handshake.time})`);
        }
    })

    // quit chat Room
    socket.on('leave_room', (roomName,done) => {
        console.log("🏇 퇴장한 roomName ",roomName)
        
        socket.leave(roomName);
        console.log('🎴 해당 socket 이 퇴장하고 rooms 목록', socket.rooms); 

        io.emit("room_name", publicRooms());
        done();

        // socket이 속한 방 이름 조회(기본적으로 자신의 id로 된 서버-유저 priavate Room 존재)
        console.log('rooms', socket.rooms); 


        /* show entire chat room member and number
        const roomInfo = {
            personnel: socket.adapter.rooms.get(roomName).size, 
            members: Array.from(socket.adapter.rooms.get(roomName)),
            sids: Array.from(socket.adapter.sids)
        }
        console.log('roomInfo',roomInfo);
        
        socket.emit('room_info', roomInfo);
        */
        
        if(roomName !== null){
            io.to(roomName).to(socket.id).emit("welcome_event",`${socket.id} 님이 room ${roomName}에서 퇴장하셨습니다. (퇴장시간 : ${socket.handshake.time})`);
        }    

        console.log(`User ${socket.id} left room ${roomName}`);
        console.log(publicRooms());
    });

    // receive a nickname changed
    var nickname = 'NEWBIE';
    socket.on("nickname", function (data) {
        
        console.log("nickname : ", data)

        if(!nickname){
            nickname = data;
            
            socket.emit('msg', `${socket.id} has changed nickname as ${nickname}.`)
            socket.broadcast.emit('msg', `${socket.id} has changed nickname as ${nickname}.`)
        } else {
            nickname_past = nickname;
            nickname = data;

            socket.emit('msg', `${nickname_past} has changed nickname as ${nickname}.`)
            socket.broadcast.emit('msg', `${nickname_past} has changed nickname as ${nickname}`)
        }
    });

    // broadcasting a entering message to everyone who is in the chatroom
    io.emit('msg', `NEWBIE (${socket.id}) has entered the server. (입장시간 : ${socket.handshake.time}))`)

    
    // receive a message and display to all and also sender himself
    socket.on('msg', async function (chatMsg) {
        console.log(socket.id,': ', chatMsg);
        // broadcasting a message to everyone except for the sender
        const chat = {
            'socket.rooms' : Array.from(socket.adapter.rooms),
            'socket.id' : socket.id,
            nickname : nickname,
            chatMsg : chatMsg,
            time : new Date().toString()
        }

        socket.broadcast.emit('chat', chat);
        
        // emit a message to sender himself also    
        socket.emit('chat', chat );

        // store a message to DB
        await mongooseFunctionSJ.mongooseWrite(modelChat, chat);
    });

    // receive a spsecific msg and show only to its room
    socket.on("msg_toRoom", (chatMsg,room) => {
        console.log("recevie specific msg, room => ", chatMsg, room);

        const specific_chat = {
            'socket.rooms' : Array.from(socket.adapter.rooms),
            'socket.sids' : Array.from(socket.adapter.sids),
            'socket.id' : socket.id,
            nickname : nickname,
            chatMsg : chatMsg,
            time : new Date().toString()
        }

        io.to(room).emit("specific_chat", specific_chat);
        //done(specific_msg);
    })

    // user connection lost
    socket.on('disconnect', function (data) {
        console.log(`User ${socket.id} Out!`)
        io.emit('msg', `${socket.id} has left the server.`);
        //io.emit('leave_room', publicRooms());
    });
});

// (HTTP) /chat 으로 들어올 경우 client-server-nodejs 에서 html 뿌려줌
app.get('/chat', function(req, res) {
    res.sendFile(__dirname + '/chat.html');
});

// (HTTP) /react 으로 들어올 경우 client-server에서 리액트로만든 html 뿌려줌
var path = require('path');

app.get('/react', function(req, res) {
    res.sendFile(path.resolve('../client-server/build/index.html'));
});

// (HTTP) /api/chatsSearch 으로 들어올 경우 조건에 맞는 채팅내용 조회 (쿼리 파라미터 없으면 전체조회)
app.get('/api/chatSearch', async (req, res) => {

    const search ={};
    const { searchCondition, searchTerm } = req.query;

    console.log("req.query",req.query);

    if(searchCondition == 'chatNickname'){
        search.nickname = searchTerm;
    } 
    else if(searchCondition == 'chatDate'){
        search.time = searchTerm;
    }
    else if(searchCondition == 'chatMsg'){
        search.chatMsg = searchTerm;
    }else {
        search.none=null;
        // { none: null } : none 필드가 null이거나 존재하지 않는 문서를 반환.
    }

    console.log("디버깅 -> server.js 검색조건",search);

    try {
        const searchedChatHistory = await mongooseFunctionSJ.mongooseReadAll(modelChat, search);
        console.log("필터링한 채팅내보낼게요");
        res.json(searchedChatHistory);
    } catch (error){
        res.status(500).json({ error: 'Error fetching chat history' })
    }
});



