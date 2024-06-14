//npm init -y
//npm install nodemon (안하면 node server.js 로 실행)
//npm install express 
//npm install socket.io
const axios = require('axios');


/**
 * 몽고 DB 연결!
*/

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


/*
 * 웹서버 개설
*/

const express = require('express');
const app = express();

// front 서버에서 들어오는 요청을 허용
const cors = require('cors'); 
app.use(cors());

const port = 8081;
const server = app.listen(port, function() {
    console.log('🛫 Express server Listening on '+port);
});


/*
 * 웹서버 위에 socket.io 얹기 (?)
*/

const SocketIO = require('socket.io');
const io = SocketIO(server, {
    // node 서버와 웹서버가 다를 경우 cors 문제 생김
    cors: {
        origin: "*",
    },
    path: '/socket.io'
});



/*
 * 카프카
*/

const { Kafka } = require('kafkajs')

const kafka = new Kafka({ // Kafka 클라이언트 설정중
    clientId: 'my-app',
    brokers: ['localhost:9092'] // Kafka 브로커의 주소
})

const producer = kafka.producer()

const initKafka = async() => { // 프로듀서를 생성하고 Kafka 브로커와 연결
    await producer.connect()
}

app.get('/events/:event', async(req, res) => { 

    await producer.send({ // 요청이 들어오면 해당 이벤트를 아래 토픽에 전송
        topic: 'quickstart-events',
        messages: [
            { value: req.params.event },
        ]
    })
    res. send('successfully stored event @kafka : ' + req.params.event + '\n')
  })
  
app.listen(port+1, () => { // 서버 시작
console.log(`🛩️ kafka app listening on port ${port+1}`)
})

initKafka();



/*
 * 채팅 시작
*/

io.on('connection', async function (socket) {

    console.log(socket.id, ' connected...');

    // return public room names by comparing sids and rooms
    function publicRooms(){
        // 현재 소켓 안의 adapter 정보
        const { 
            adapter : { sids, rooms } 
        } = socket;

//        console.log("-------------------------------------------------- sids",sids)
//        console.log("-------------------------------------------------- rooms",rooms)

        // 현재 소켓에서 publicRooms 조회
        const publicRooms = [];
        rooms.forEach((_,key)=>{
            if(sids.get(key) === undefined) {
                publicRooms.push(key);
            }
        })

//       console.log("-------------------------------------------------- publicRooms", publicRooms)

        return publicRooms;
    }

    // show a initial chatRoom when user join in 
    socket.on("init_chatRoom", (roomName, done) => {

        // 입장한 채팅룸
        console.log("🌹roomName", roomName);

        // 채팅룸을 client 에 표시
        socket.join(roomName);
        done(publicRooms());

        // 채팅내역 복구
        const messageHistory = mongooseFunctionSJ.mongooseReadAll(modelChat, '김대민')
        socket.to(roomName).emit("msg_history", messageHistory);

    })

    // open new chat Room and return room's 실시간접속 information 
    socket.on("enter_room", async (roomName,done)=>{
        console.log('🎴 입장한 roomName', roomName);
        console.log('🎴 해당 socket 이 입장한 rooms 목록', socket.rooms); 

        // search current chatroom from api server
        axios.get('http://localhost:8080/chatroom/getMyChatrooms?memberId=24241')
        .then(response => {
 
            // 받아온 채팅방 목록에서 선택한 채팅방이 있는지 확인
            const chatrooms = response.data;

            // 서버에 존재하는 채팅룸들
            console.log("--- mySQL 저장된 채팅룸 목록---")
            chatrooms.forEach(room=>console.log(room.chatroomName));
            console.log("-----------------------------")

            const existingRoom = chatrooms.find(room => {
                if(room.chatroomName === roomName)
                    return room.chatroomName;
            })
            console.log(existingRoom);

            // 채팅방이 존재하면 입장
            if(existingRoom){
                socket.join(existingRoom.chatroomName);

                const enterMsg = `${socket.id} 가 ${existingRoom.chatroomName} 에 입장했습니다.`
                socket.to(existingRoom.chatroomName).emit("enter_msg", enterMsg)
                console.log(enterMsg)
                
                const socketData ={
                    'current_socket.id' : socket.id,
                    existingRoom : existingRoom,
                    // show entire chat room member and number
                    roomInfo : {
                        personnel: socket.adapter.rooms.get(existingRoom.chatroomName).size, 
                        members: Array.from(socket.adapter.rooms.get(existingRoom.chatroomName)),
                        sids: Array.from(socket.adapter.sids)
                    },
                    publicRooms : publicRooms()
                }
                done(socketData)

            } else {
                // 채팅방이 존재하지 않으면 에러 처리
                console.error(`Room {${roomName}} does not exist.`);
            }
        })
        .catch(error => {
            console.error('There was an error fetching the chat rooms!', error);
        });
    })

    // quit chat Room
    socket.on('leave_room', (roomName,done) => {
        console.log("🏇 퇴장한 roomName ",roomName)
        
        socket.leave(roomName);
        console.log('🎴 socket.rooms', socket.rooms); // 소켓 자신만 남음
        console.log('🎴 publicRooms() ', publicRooms()); // 남은 방...

        const leaveMsg = `${socket.id} 가 ${roomName} 에서 퇴장했습니다.`
        socket.to(roomName).emit("leave_msg", leaveMsg)
        console.log(leaveMsg)
        done(roomName);
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
            chatroomName : '여기에 채팅방저장',
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
    socket.on("msg_toRoom", async (chatMsg,room) => {
        console.log("recevie specific msg, room => ", chatMsg, room);

        const specific_chat = {
            chatroomName : room,
            'socket.rooms' : Array.from(socket.adapter.rooms),
            'socket.sids' : Array.from(socket.adapter.sids),
            'socket.id' : socket.id,
            nickname : nickname,
            chatMsg : chatMsg,
            time : new Date().toString()
        }

        const msg = `${specific_chat.nickname} : ${specific_chat.chatMsg} (${specific_chat.time})`;

        await mongooseFunctionSJ.mongooseWrite(modelChat, msg);
        socket.to(room).emit("specific_chat", msg);

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



