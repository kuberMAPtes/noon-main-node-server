//npm install express 

//npm install socket.io
//npm install mongoose => 서버에 설치
//npm install redis => 서버에 설치
//npm install kafkajs => (일단 생략)

// 컨테이너 : Node 넣고 npm install , ssh 넣기 
// 서버 : mongoose, redis, 


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
 * 몽고 DB 연결
*/

var mongoose = require('mongoose');
const mongooseFunctionSJ = require('./mongoDB_lib_SJ');

var MongooseModel; // 모델(=테이블?)임
async function initialSetting(){
    MongooseModel = await mongooseFunctionSJ.mongooseSetup();
}

initialSetting();   

// *** 복붙하기 위한 임시 코드 ***
async function temp(){

await mongooseFunctionSJ.mongooseWrite(MongooseModel.ModelChatMessage, chat);
await mongooseFunctionSJ.mongooseReadOne(MongooseModel.ModelChatMessage, chat);
await mongooseFunctionSJ.mongooseReadMany(MongooseModel.ModelChatMessage);
await mongooseFunctionSJ.mongooseUpdate(MongooseModel.ModelChatMessage, chat);
await mongooseFunctionSJ.mongooseDelete(MongooseModel.ModelChatMessage, chat);

mongoose.connection.close();
}



/*
 * 레디스 연결
*/

const redis = require('redis');

const redisClient = redis.createClient({
    host: 'localhost',
    port: 6379, // Redis 기본 포트는 6379입니다. 필요에 따라 변경 가능
    legacyMode: true // legacyMode 옵션 안넣으면 res.send 안됨
});

redisClient.connect();

redisClient.on('connect', () => {
    console.log('☑️  Redis client connected');
});

// 기본 redisClient 객체는 콜백기반인데 v4버젼은 프로미스 기반으로 사용가능
const redisClientV4 = redisClient.v4

const forexample = async () => {
    await redisClientV4.get("외않되");
}



/*
 * 카프카 연결
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
  
//initKafka();



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

    // restore prvious messages 
    socket.on("msg_history", async (roomInfo,done)=>{
        console.log("\n\n\n 🐬 EVENT : msg_history ")

        // 채팅내역 복구
        const searchCondition = { chatroomID: roomInfo.chatroomID ? roomInfo.chatroomID : '없어시방' };
        const messageHistory = await mongooseFunctionSJ.mongooseReadMany(MongooseModel.ModelChatMessage, searchCondition);
    
        if (messageHistory.length !== 0) {
          console.log("채팅 불러온 개수는 ", messageHistory.length);
        }
    
        console.log(`ㅡ ${messageHistory.length} 개의 이전 채팅을 클라이언트에 주자`);
    
        done(messageHistory);

    })

    // show a initial chatRoom when user join in 
    socket.on("live_socketRoomInfo", async (roomInfo, done) => {
        console.log("\n\n\n 🐬 EVENT : live_socketRoomInfo ")
        // 입장한 채팅룸
        console.log("🌹클라이언트가 요청한 roomInfo", roomInfo);

        if (Object.keys(roomInfo).length === 0){ //roomInfo 가 null or undefined 일 경우 대비
            console.log("🚨roomInfo 없어서 init_chatRoom 종료");
            return null;
        }

        // 채팅룸을 client 에 표시
        socket.join(roomInfo.chatroomName);
        done(roomInfo.chatroomName);
        console.log(`ㅡ ${roomInfo.chatroomName} 에 입장... 이전 채팅내역 조회하자 ...`);
    })

    // add a User who readed messages
    socket.on("message_read", async (memberID, roomInfo, done)=>{
        console.log("\n\n\n 🐬 EVENT : message_read ");

        console.log("memberID=>", memberID);
        console.log("roomInfo => ", roomInfo);

        const update_query = {
            //readMember 에 사용자 ID가 없는 경우찾기 
            chatroomID: roomInfo.chatroomID, 
            readMembers: { $ne: socketToMember[socket.id] }
        }
        const update_action = {
            // 없다면 에는 사용자 ID 삽입
            $push: { readMembers: socketToMember[socket.id] }
        }

        const updated_result = await mongooseFunctionSJ.mongooseUpdate(MongooseModel.ModelChatMessage, update_query, update_action);

        done(updated_result);
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

        // 방 입장하면 기존 소켓들에게 알려 실시간 접속자 업데이트되게끔
        socket.to(socketRoom).emit("enter_room_notice", memberIds);


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

        const leaveMsg = `${socketToMember[socket.id]} 가 ${roomInfo.chatroomName} 에서 퇴장했습니다.`

        const Message = {
            type : 'notice', //css로 내가 보냈는지 남이 보냈는지 별도로 표기
            text : leaveMsg
        }

        socket.to(roomInfo.chatroomName).emit("leave_msg", Message)
        console.log(Message)
        done(roomInfo.chatroomName);

        const memberIds = getRoomMembersID(roomInfo.chatroomName)
        done(memberIds)

        // 방 나가면 기존 소켓 유저에게 실시간 유저 정보를 재전달
        socket.to(roomInfo.chatroomName).emit("leave_room_notice", memberIds);
    });

    // (개발중) kick user from chat Room
    // socket.on('kick_room', () => {
    // })

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
            sender : socketToMember[socket.id],
            chatMsg : chatMsg,
            time : new Date(),
            readMembers : [socketToMember[socket.id]] // 채팅 읽은 사용자들의 ID 배열
        }

        await mongooseFunctionSJ.mongooseWrite(MongooseModel.ModelChatMessage, specific_chat);

        const otherMessage = {
            type : 'other', //css로 내가 보냈는지 남이 보냈는지 별도로 표기
            text : `${specific_chat.sender} : ${specific_chat.chatMsg} \n( ${specific_chat.time.toString()} )`,
            readMembers : specific_chat.readMembers
        }    
        socket.to(roomInfo.chatroomName).emit("specific_chat", otherMessage);

    })
    
    // return current message numbers;
    
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

    // (depreacated) broadcasting a entering message to everyone who is in the chatroom
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
        await mongooseFunctionSJ.mongooseWrite(MongooseModel.ModelChatMessage, chat);
    });

    // user connection lost
    socket.on('disconnect', function (data) {
        console.log(`User ${socket.id} Out!`)
        io.emit('msg', `${socket.id} has left the server.`);
        //io.emit('leave_room', publicRooms());
    });
});



/*
 * HTTP 요청처리
*/

const bodyParser = require('body-parser'); // body-parser 추가

app.use(bodyParser.json()); // JSON 형식의 요청 본문을 파싱
app.use(bodyParser.urlencoded({ extended: true })); // URL-encoded 형식의 요청 본문을 파싱

// myChatroomList client 요청을 받아 mongoDB에서 안읽은 메세지 수 + 활발한 채팅방을 가져옴
app.post('/node/messageUnread', async function(req,res){
    console.log("\n\n\n 🐬 EVENT : /node/messageUnread ");
    const { chatrooms, memberID } = req.body;

    console.log("chatrooms 받았다", chatrooms);

    try {
        for (const chatroom of chatrooms) {
            const search = {
                chatroomID: chatroom.chatroomID,
                readMembers: { $ne: memberID }
            };

            const unreadMessageCount = await mongooseFunctionSJ.mongooseReadMany(MongooseModel.ModelChatMessage, search);
            
            chatroom.unreadMessage = unreadMessageCount.length
        }

        console.log("chatroom 최종" , chatrooms);

        var activeRooms;
        await redisClient.get('activeRooms', (err, data) => {
            if (err) throw err;
        
            activeRooms = JSON.parse(data);

            const response = {chatrooms:chatrooms, activeRooms: activeRooms}
            res.json(response);
        });

    } catch (error) {
        console.error('Error fetching unread messages count', error);
        res.status(500).json({ message: 'Error fetching unread messages count' });
    }
})



/*
 * 스케쥴링 (일정 시간마다 활발한 채팅방 체크해서 redis에 저장)
*/

const cron = require('node-cron');

cron.schedule('*/10 * * * * *', async () => { // 매 시간마다 실행
    const twentyFourHoursAgo = new Date(Date.now() - 24*60*60*1000); // 24시간 전을 의미함 10분전까지 => 10 * 60 * 1000
    console.log('⌛ 활발한 채팅방 체크 (5초마다 조회됩니다) ');

    // 초: 매 5초마다 (*/5 이후 5개)
    // 분: 매 5분마다 (*/5 이후 4개)
    // 시: 매 5시간마다 (*/5 이후 3개)
    // 일: 매 5일마다 (*/5 이후 2개)
    // 월: 매 5달마다 (*/5 이후 1개)
    // 요일: 매 요일 (*/5) 

    const popularChatrooms = await MongooseModel.ModelChatMessage.aggregate([ // 데이터 처리 및 집계를 위한 함수
        { $match: { time: { $gte: twentyFourHoursAgo } } }, // time이 일정기준보다 크거나 같은 메시지들 선택 (gte : greater than or equal to)
        { $group: { _id: '$chatroomID', messageCount: { $sum: 1 } } }, // chatroomID로 메세지를 그룹화하고 각 그룹의 메세지 수를 messageCount에 저장 ($sum:1 이면 각 문서를 1로 취급)
        { $sort: { messageCount: -1 } }, // messageCount 를 내림차순으로 정렬
        { $limit: 10 } // 상위 10개 결과 (채팅방)을 가져옴
    ]);

    // 집계를 위해 사용한 _id 를 chatroomID로 매핑
    const formattedChatrooms = popularChatrooms.map(chatroom => ({
        chatroomID: chatroom._id, // _id를 chatroomId로 변경
        messageCount: chatroom.messageCount
    }));

    // 활발한 채팅방을 몽고DB에 저장 (없어도 됨그냥 해놓음)
    try {
        await MongooseModel.ModelpopularChatroom.deleteMany({});

        await MongooseModel.ModelpopularChatroom.insertMany(formattedChatrooms);
        console.log('기존 인기채팅 mongoDB 삭제하고 인기채팅방 데이터를 변환해서  성공적으로 저장되었습니다');

    } catch (error) {
        console.error('데이터 저장 중 오류가 발생했습니다:', error);
    }

    // 활발한 채팅방을 redisDB에 저장 (갖다 쓰세요)
    try {
        // 몽고 DB에 들렀다 올때나 써야되는 코드 (없어도 됨 그냥 해놓음)
        // const updatedPopularChatrooms = await MongooseModel.ModelpopularChatroom.find({});
        
        redisClient.set('activeRooms', JSON.stringify(formattedChatrooms));

        console.log('redis 에 활발한 채팅방 목록이 업데이트되었습니다.');
       
        redisClient.get('activeRooms', (err, data) => {
            if (err) throw err;
            console.log('redis 에서 구경한 활발한 채팅방:', JSON.parse(data));
        });

        } catch (error) {
            console.error('인기 채팅방 정보 업데이트 중 에러 발생:', error);
        }

});



/*
 * 레디스 HTTP 테스트
*/

app.get('/set', (req, res) => {
    const { key, value } = req.query;
    console.log("set req.query" , req.query);

    redisClient.set(key, value, (err, reply) => {
        console.log("🌈 redis 실행")
        
        if (err) {
            res.status(500).send('Error setting key');
        } else {
            res.send(`Set key: ${reply}`);
        }
    });
});

app.get('/get', async(req, res) => {
    const { key } = req.query;
    console.log("get req.query" , req.query);
    
    redisClient.get(key, (err, reply) => {
        console.log("🌈 redis 실행")

        if (err) {
            res.status(500).send('Error getting key');
        } else {
            console.log(reply);
            res.send(`Get key: ${reply}`);
        }
    });

});



/*
 * 카프카 HTTP 테스트
*/

app.get('/events/:event', async(req, res) => { 

    await producer.send({ // 요청이 들어오면 해당 이벤트를 아래 토픽에 전송
        topic: 'quickstart-events',
        messages: [
            { value: req.params.event },
        ]
    })
    res. send('successfully stored event @kafka : ' + req.params.event + '\n')
  })



/*
 * deprecated
*/

// (deprecated) /chat 으로 들어올 경우 client-server-nodejs 에서 html 뿌려줌
app.get('/chat', function(req, res) {
    res.sendFile(__dirname + '/chat.html');
});

// (deprecated) /react 으로 들어올 경우 client-server에서 리액트로만든 html 뿌려줌
var path = require('path');

app.get('/react', function(req, res) {
    res.sendFile(path.resolve('../client-server/build/index.html'));
});

// (deprecated) /api/chatsSearch 으로 들어올 경우 조건에 맞는 채팅내용 조회 (쿼리 파라미터 없으면 전체조회)
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
        const searchedChatHistory = await mongooseFunctionSJ.mongooseReadAll(MongooseModel.ModelChatMessage, search);
        console.log("필터링한 채팅내보낼게요");
        res.json(searchedChatHistory);
    } catch (error){
        res.status(500).json({ error: 'Error fetching chat history' })
    }
});



