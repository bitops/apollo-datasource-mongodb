import { MongoClient, ObjectId } from 'mongodb'
import mongoose, { Schema, model } from 'mongoose'

import { MongoDataSource } from '../datasource'
import { isModel, isCollectionOrModel, getCollection } from '../helpers'

mongoose.set('useFindAndModify', false)

class Users extends MongoDataSource {
  initialize(config) {
    super.initialize(config)
  }
}

describe('MongoDataSource', () => {
  it('sets up caching functions', () => {
    const users = {}
    const source = new Users(users)
    source.initialize()
    expect(source.findOneById).toBeDefined()
    expect(source.findByFields).toBeDefined()
    expect(source.deleteFromCacheById).toBeDefined()
    expect(source.deleteFromCacheByFields).toBeDefined()
    expect(source.collection).toEqual(users)
  })
})

const URL = 'mongodb://localhost:27017/test-apollo-datasource'
const connectArgs = [
  URL,
  {
    useNewUrlParser: true,
    useUnifiedTopology: true
  }
]

const connect = async () => {
  const client = new MongoClient(...connectArgs)
  await mongoose.connect(...connectArgs)
  await client.connect()
  return client.db()
}

const hexId = '5cf82e14a220a607eb64a7d4'
const objectID = ObjectId(hexId)

describe('Mongoose', () => {
  let UserModel
  let userCollection
  let alice
  let nestedBob

  beforeAll(async () => {
    const userSchema = new Schema({ name: 'string' })
    UserModel = model('User', userSchema)

    const db = await connect()
    userCollection = db.collection('users')
    alice = await UserModel.findOneAndUpdate(
      { name: 'Alice' },
      { name: 'Alice' },
      { upsert: true, new: true }
    )

    nestedBob = await userCollection.findOneAndReplace(
      { name: 'Bob' },
      { name: 'Bob', nested: [{ _id: objectID }] },
      { new: true, upsert: true }
    )
  })

  test('isCollectionOrModel', () => {
    expect(isCollectionOrModel(userCollection)).toBe(true)
    expect(isCollectionOrModel(UserModel)).toBe(true)
    expect(isCollectionOrModel(Function.prototype)).toBe(false)
    expect(isCollectionOrModel(undefined)).toBe(false)
  })

  test('isModel', () => {
    expect(isModel(userCollection)).toBe(false)
    expect(isModel(UserModel)).toBe(true)
    expect(isCollectionOrModel(Function.prototype)).toBe(false)
    expect(isCollectionOrModel(undefined)).toBe(false)
  })

  test('mongoose class-based components', () => {
    /**
     * @see https://github.com/GraphQLGuide/apollo-datasource-mongodb/issues/51
     */

    const ClassModel = mongoose.model(
      class ClassModel extends mongoose.Model {},
      new Schema({ name: 'string' })
    )

    expect(isModel(ClassModel)).toBe(true)
    expect(isCollectionOrModel(ClassModel)).toBe(true)
  })

  test('getCollectionName', () => {
    expect(getCollection(userCollection).collectionName).toBe('users')
    expect(getCollection(UserModel).collectionName).toBe('users')
  })

  test('Data Source with Model', async () => {
    const users = new Users(UserModel)
    users.initialize()
    const user = await users.findOneById(alice._id)
    expect(user.name).toBe('Alice')
    expect(user.id).toBe(alice._id.toString())
  })

  test('Data Source with Collection', async () => {
    const users = new Users(userCollection)
    users.initialize()

    const user = await users.findOneById(alice._id)

    expect(user.name).toBe('Alice')
    expect(user.id).toBeUndefined()
  })

  test('nested findByFields', async () => {
    const users = new Users(userCollection)
    users.initialize()

    const [user] = await users.findByFields({ 'nested._id': objectID })

    expect(user).toBeDefined()
    expect(user.name).toBe('Bob')
  })
})
