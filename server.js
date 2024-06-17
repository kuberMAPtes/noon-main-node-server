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
await mongooseFunctionSJ.mongooseReadMany(modelChat);
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

// 연결된 소켓과 로그인 유저 아이디 간의 매핑을 저장할 객체
const socketToMember = {};

io.on('connection', async function (socket) {

    console.log(socket.id, ' connected...');

    // mapping memberId to socketId
    socket.on('mapping_memberID_to_socketID', (memberID, done) => {
        // 소켓 ID와 사용자 이름 매핑 저장
        socketToMember[socket.id] = memberID;
        
        done(`${memberID} 가 ${socket.id} 에 매핑됨`)
    })

    // get user List from joined socket room
    function getRoomMembersID(roomName){
        console.log(`\n🦐 getRoomMembersID 실행, 채팅방 ${roomName} 을 조회중`)

        const socketsInRoom = io.sockets.adapter.rooms.get(roomName); // roomName 이란 소켓룸

        if (!socketsInRoom) return [];

        const membersID = [];

        // socketId 들을 넣으면 실제 사용자 아이디로 매핑해서 돌려줌
        socketsInRoom.forEach(socketId => {
            const username = socketToMember[socketId];
            if (username) {
                membersID.push(username);
            }
        });

        return membersID;        
    }

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
    socket.on("init_chatRoom", async (roomInfo, done) => {
        console.log("\n\n\n 🐬 EVENT : init_chatRoom ")
        // 입장한 채팅룸
        console.log("🌹클라이언트가 요청한 roomInfo", roomInfo);

        // 채팅룸을 client 에 표시
        socket.join(roomInfo.chatroomName);
        done(roomInfo.chatroomName);
        console.log(`ㅡ ${roomInfo.chatroomName} 에 입장... 이전 채팅내역 조회하자 ...`);

        // 채팅내역 복구
        const searchCondition = { chatroomID: roomInfo.chatroomID ? roomInfo.chatroomID : '없어시방' }
        const messageHistory = await mongooseFunctionSJ.mongooseReadMany(modelChat, searchCondition)
        if(messageHistory.length !== 0){
            console.log("채팅 불러온 개수는 ", messageHistory.length);
        }

        console.log(`ㅡ ${messageHistory.length} 개의 이전 채팅을 클라이언트에 주자`)
        socket.to(roomInfo.chatroomName).emit("msg_history", messageHistory);

    })

    // open new chat Room and return room's 실시간접속자 information 
    socket.on("enter_room", async (socketRoom,done)=>{
        console.log("\n\n\n 🐬 EVENT : enter_room ", socketRoom)

        // api 서버에서 받은 채팅방이름으로 소켓룸을 만듦
        socket.join(socketRoom);
        console.log('socket 서버에도 채팅방 입장(or 개설) ', socketRoom);
        console.log('socket 서버에도 채팅방 목록 ', socket.rooms);

        const enterMsg = `${socketToMember[socket.id]} 가 ${socketRoom} 에 입장했습니다.`

        const Message = {
            type : 'notice', //css로 내가 보냈는지 남이 보냈는지 별도로 표기
            text : enterMsg
        }
        console.log(Message)

        socket.to(socketRoom).emit("enter_msg", Message)
        
        // 소켓룸 이름을 넣어서 참여중인 멤버들의 실제 'member Id' 를 반환
        const memberIds = getRoomMembersID(socketRoom)
        done(memberIds)

        // (temporarily deprecated) search current chatroom from api server
        /*
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

                const Message = {
                    type : 'notice', //css로 내가 보냈는지 남이 보냈는지 별도로 표기
                    text : enterMsg
                }

                socket.to(existingRoom.chatroomName).emit("enter_msg", Message)
                console.log(Message)
                
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
        */
    })

    // quit chat Room
    socket.on('leave_room', (roomInfo,done) => {
        console.log("\n\n\n 🐬 EVENT : leave_room ")
        console.log("퇴장한 roomInfo ",roomInfo)
        
        socket.leave(roomInfo.chatroomName);
        console.log('🎴 socket.rooms', socket.rooms); // 소켓 자신만 남음
        console.log('🎴 publicRooms() ', publicRooms()); // 남은 방...

        const leaveMsg = `${socket.id} 가 ${roomInfo.chatroomName} 에서 퇴장했습니다.`

        const Message = {
            type : 'notice', //css로 내가 보냈는지 남이 보냈는지 별도로 표기
            text : leaveMsg
        }

        socket.to(roomInfo.chatroomName).emit("leave_msg", Message)
        console.log(Message)
        done(roomName);
    });

    // (deprecated) receive a nickname changed
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

    
    // (deprecated) receive a message and display to all and also sender himself
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
    socket.on("msg_toRoom", async (chatMsg, roomInfo) => {
        console.log("\n\n\n 🐬 EVENT : msg_toRoom ");
        console.log("보낸 메세지=>", chatMsg);
        console.log("roomInfo => ", roomInfo);

        const specific_chat = {
            chatroomID : roomInfo.chatroomID,
            chatroomName : roomInfo.chatroomName,
            'socket.rooms' : Array.from(socket.adapter.rooms),
            'socket.sids' : Array.from(socket.adapter.sids),
            'socket.id' : socket.id,
            nickname : nickname,
            chatMsg : chatMsg,
            time : new Date().toString()
        }

        await mongooseFunctionSJ.mongooseWrite(modelChat, specific_chat);

        const otherMessage = {
            type : 'other', //css로 내가 보냈는지 남이 보냈는지 별도로 표기
            text : `${specific_chat.nickname} : ${specific_chat.chatMsg} (${specific_chat.time})`
        }    
        socket.to(roomInfo.chatroomName).emit("specific_chat", otherMessage);

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



