import express, { json } from 'express';
import 'dotenv/config';
import cors from 'cors';
import { MongoClient, ObjectId, ServerApiVersion } from 'mongodb';

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(json());

const uri = `mongodb+srv://${process.env.USER_NAME}:${process.env.PASSWORD}@cluster0.blfnk.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server (optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db('admin').command({ ping: 1 });
    console.log(
      'Pinged your deployment. You successfully connected to MongoDB!'
    );

    const database = client.db('ProdVent');
    const productsColl = database.collection('products');
    const usersColl = database.collection('users');

    // Get 4 feature product data from DB
    app.get('/products', async (req, res) => {
      try {
        const productAll = await productsColl.find().limit(4).toArray();
        res.send(productAll);
      } catch (error) {
        console.log(error);
        res.status(500).send('Failed to fetch products');
      }
    });

    // Get 6 trending product data from DB
    app.get('/trending', async (req, res) => {
      try {
        const productAll = await productsColl.find().toArray();
        // Filter 6 most liked products
        productAll.sort((a, b) => b.vote - a.vote);
        productAll.length = 6;
        res.send(productAll);
      } catch (error) {
        console.log(error);
        res.status(500).send('Failed to fetch trending products');
      }
    });

    // Get product data by ID
    app.get('/product/details/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const product = await productsColl.findOne(query);
        res.send(product);
      } catch (error) {
        console.log(error);
        res.status(500).send('Failed to fetch product details');
      }
    });

    // Upvote a product in DB
    app.patch('/product/upvote/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const email = req.body.user;
        const query = { _id: new ObjectId(id) };

        // Check if user already liked the product
        const product = await productsColl.findOne(query);
        if (product.likedUsers.includes(email)) {
          res.send('already liked');
          return;
        }

        const options = { upsert: true };
        const updateDoc = {
          $inc: { vote: 1 },
          $addToSet: { likedUsers: email },
        };
        const result = await productsColl.updateOne(query, updateDoc, options);
        res.send(result);
      } catch (error) {
        console.log(error);
        res.status(500).send('Failed to upvote product');
      }
    });

    // Save user data to DB
    app.post('/user', async (req, res) => {
      try {
        const user = req.body;

        // Check if user already exists
        const isUserExist = await usersColl.findOne({ email: user.email });
        if (isUserExist) return res.send('User already exists');

        // Save user data
        const result = await usersColl.insertOne(user);
        res.send(result);
      } catch (error) {
        console.log(error);
        res.status(500).send('Failed to save user');
      }
    });
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}

run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('ProdVent server is running!');
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
