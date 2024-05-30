// 1. mongoose 모듈 가져오기
var mongoose = require('mongoose');

async function mongooseSetup(){

    // 2. testDB 세팅
    mongoose.connect('mongodb://localhost:27017/testDB');

    // 3. 연결된 testDB 사용
    var db = mongoose.connection;

    // 4. 연결 실패
    db.on('error', function(){
        console.log('Connection Failed!');
    });
    // 5. 연결 성공
    db.once('open', function() {
        console.log('Connected!');
    });

    // 6. Schema 생성
    var chat = mongoose.Schema({
        nickname : 'string',
        'socket.id' : 'string',
        chatMsg : 'string',
        time : 'string'
    });

    // 7. 정의된 스키마를 객체처럼 사용할 수 있도록 model() 함수로 컴파일
    var ModelChat = mongoose.model('Schema', chat);

    return ModelChat;
}

async function mongooseReadOne(ModelChat, search){
    // 9. 특정 데이터 조회
    try {
        console.log("디버깅 -> 검색조건", search);
        const searchedChat = await ModelChat.findOne(search);
        console.log('Chat found:', searchedChat);

        return searchedChat;

        } catch (err) {
        console.error(err);
        }
}

async function mongooseReadAll(ModelChat, search){
    // 10. 전체 데이터 조회
    try {
        console.log("디버깅 -> mongooseReadAll 검색조건", search);
        const searchedChats = await ModelChat.find(search);
        console.log('Chats found number:', searchedChats.length);

        return searchedChats;

        } catch (err) {
        console.error(err);
        }
}

async function mongooseWrite(ModelChat,chat){
    // 8. 데이터 저장
    try {
        const newChat = new ModelChat(chat);
        await newChat.save();
        console.log('Chat created:', newChat);
      } catch (err) {
        console.error(err);
      }   
}

async function mongooseUpdate(ModelChat){
    // 11. 데이터 수정
    try {
        const updatedChat = await ModelChat.findOneAndUpdate(
          { name: 'Alice' },
          { age: 31 },
          { new: true } // 업데이트된 문서를 반환하도록 설정
        );
        console.log('Chat updated:', updatedChat);
      } catch (err) {
        console.error(err);
      }
}

async function mongooseDelete(ModelChat){
    // 12. 데이터 삭제
    try {
        const deletedChat = await ModelChat.findOneAndDelete({ name: 'Alice' });
        console.log('Chat deleted:', deletedChat);
      } catch (err) {
        console.error(err);
      }
}


module.exports = {
    mongooseSetup,
    mongooseWrite,
    mongooseReadOne,
    mongooseReadAll,
    mongooseUpdate,
    mongooseDelete
};