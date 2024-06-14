const { Kafka } = require('kafkajs')

const kafka = new Kafka({
  clientId: 'my-app',
  brokers: ['localhost:9092']
})

const consumer = kafka.consumer({ groupId: 'test-group' })

const initKafka = async () => {
  console.log('start subscribe')
  await consumer.connect()
  await consumer.subscribe({ topic: 'quickstart-events', fromBeginning: true })
  
  await consumer.run({
  eachMessage: async ({ topic, partition, message }) => {
    console.log({
      topic: topic,
      partition: partition,
      value: message.value.toString(),
    })
   },
  })
}

initKafka();