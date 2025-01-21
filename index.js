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
    const reviewsColl = database.collection('reviews');

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

    // Get all product data from DB
    app.get('/all-products', async (req, res) => {
      try {
        const productAll = await productsColl.find().toArray();
        res.send(productAll);
      } catch (error) {
        console.log(error);
        res.status(500).send('Failed to fetch all products');
      }
    });

    // Get product details and review data by ID
    app.get('/product/details/:id', async (req, res) => {
      try {
        const id = req.params.id;

        // Get query for product details
        const productQuery = { _id: new ObjectId(id) };
        const product = await productsColl.findOne(productQuery);

        // Get query for product reviews
        // const reviewQuery = { productId: id };
        // const reviews = await reviewsColl.find(reviewQuery).toArray();

        // const result = { product, reviews: reviews[0]?.reviews } || [];
        res.send(product);
      } catch (error) {
        console.log(error);
        res.status(500).send('Failed to fetch product details');
      }
    });

    // Get all reviews by product ID
    app.get('/product/:id/reviews', async (req, res) => {
      try {
        const id = req.params.id;
        const query = { productId: id };
        const reviews = await reviewsColl.find(query).toArray();
        res.send(reviews[0]?.reviews);
      } catch (error) {
        console.log(error);
        res.status(500).send('Failed to fetch reviews');
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

    // Add report to a product in DB
    app.patch('/product/report/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const email = req.body.email;
        const query = { _id: new ObjectId(id) };

        // Check if user already reported the product
        const product = await productsColl.findOne(query);
        if (product.reportedBy.includes(email)) {
          res.send('already reported');
          return;
        }
        const options = { upsert: true };

        const updateDoc = {
          $inc: { report: 1 },
          $addToSet: { reportedBy: email },
        };
        const result = await productsColl.updateOne(query, updateDoc, options);
        res.send(result);
      } catch (error) {
        console.log(error);
        res.status(500).send('Failed to report product');
      }
    });

    // Save review data to DB
    app.patch('/product/:id/reviews', async (req, res) => {
      try {
        const id = req.params.id;
        const review = req.body;
        const query = { productId: id };

        // Check if user already reviewed the product
        const filterReview = await reviewsColl.findOne(query);
        const isUserReviewed = filterReview.reviews.find(
          r => r.email === review.email
        );
        if (isUserReviewed) {
          res.send('already reviewed');
          return;
        }

        const options = { upsert: true };
        const updateDoc = {
          $push: { reviews: review },
        };
        const result = await reviewsColl.updateOne(query, updateDoc, options);
        res.send(result);
      } catch (error) {
        res.status(500).send('Failed to add review');
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

    // Get user data by email
    app.get('/user/:email', async (req, res) => {
      try {
        const email = req.params.email;
        const user = await usersColl.findOne({
          email: email,
        });
        res.send(user);
      } catch (error) {
        console.log(error);
        res.status(500).send('Failed to fetch user');
      }
    });

    // Verify user payment
    app.patch('/user/verify/:email', async (req, res) => {
      try {
        const email = req.params.email;
        const query = { email: email };
        const options = { upsert: true };
        const updateDoc = {
          $set: { status: 'verified' },
        };
        const result = await usersColl.updateOne(query, updateDoc, options);
        res.send(result);
      } catch (error) {
        console.log(error);
        res.status(500).send('Failed to verify user');
      }
    });

    // Add product to DB
    app.put('/add-product', async (req, res) => {
      try {
        const productData = req.body;
        const newProduct = {
          name: productData.productName,
          image: productData.productImage,
          description: productData.productDescription,
          tags: productData.tags,
          externalLinks: productData.externalLink,
          vote: 0,
          likedUsers: [],
          addedBy: productData.userEmail,
          timestamp: new Date(),
          report: 0,
          reportedBy: [],
          status: 'pending',
          type: 'regular',
        };
        const result = await productsColl.insertOne(newProduct);
        res.send(result);
      } catch (error) {
        console.log(error);
        res.status(500).send('Failed to save product');
      }
    });

    // Get product by email form DB
    app.get('/my-product/:email', async (req, res) => {
      try {
        const email = req.params.email;
        const emailQuery = { addedBy: email };
        const products = await productsColl.find(emailQuery).toArray();
        res.send(products);
      } catch (error) {
        console.log(error);
        res.status(500).send('Failed to fetch my products');
      }
    });

    // delete product by Id
    app.delete('/delete-product/:id', async (req, res) => {
      try {
        const id = req.params.id;
        console.log(id);
        const query = { _id: new ObjectId(id) };
        const result = await productsColl.deleteOne(query);
        res.send(result);
      } catch (error) {
        console.log(error);
        res.status(500).send('Failed to delete my products');
      }
    });

    // Get product by id
    app.get('/product/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await productsColl.findOne(query);
        res.send(result);
      } catch (error) {
        console.log(error);
        res.status(500).send('Error fetching product');
      }
    });

    // Update product by id
    app.patch('/update-product/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const product = req.body;
        const updateProduct = {
          $set: {
            name: product.productName,
            image: product.productImage,
            description: product.productDescription,
            tags: product.tags,
            externalLink: product.externalLink,
            timestamp: new Date(),
          },
        };
        const result = await productsColl.updateOne(query, updateProduct);
        res.send(result);
      } catch (error) {
        console.log(error);
        res.status(500).send('Error updating');
      }
    });

    // Change status of product (Accepted)
    app.patch('/accept-product/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const options = { upsert: true };
        const updateDoc = {
          $set: {
            status: 'accepted',
          },
        };
        const result = await productsColl.updateOne(query, updateDoc, options);
        res.send(result);
      } catch (error) {
        console.log(error);
        res.status(500).send('Error updating');
      }
    });

    // Change status of product (Rejected)
    app.patch('/reject-product/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const options = { upsert: true };
        const updateDoc = {
          $set: {
            status: 'rejected',
          },
        };
        const result = await productsColl.updateOne(query, updateDoc, options);
        res.send(result);
      } catch (error) {
        console.log(error);
        res.status(500).send('Error updating');
      }
    });

    // Change product type feature
    app.patch('/featured/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const options = { upsert: true };
        const updateDoc = {
          $set: {
            type: 'featured',
          },
        };
        const result = await productsColl.updateOne(query, updateDoc, options);
        res.send(result);
      } catch (error) {
        console.log(error);
        res.status(500).send('Error updating');
      }
    });

    // Get reported product
    // app.get('/product/reported', async (req, res) => {
    //   // const query = { report: { $gt: 0 } };
    //   const sortProduct = await productsColl.find().toArray();
    //   res.send(sortProduct);
    // });
    ////////////////////////////////////////////////////////////
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
