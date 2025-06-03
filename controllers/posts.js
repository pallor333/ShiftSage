const cloudinary = require("../middleware/cloudinary");
const Post = require("../models/Post");


module.exports = {
  getProfile: async (req, res) => {
    try {
      //Since we have a session each request (req) contains the logged-in user's info: req.user
      //Grabbing just the posts of the logged-in user
      //console.log(req.user) //to see everything
      const posts = await Post.find({ user: req.user.id });
      //sending post data from mongodb and user data to ejs template
      res.render("profile.ejs", { posts: posts, user: req.user });
    } catch (err) {
      console.log(err);
    }
  },
  getPost: async (req, res) => {
    try {
      //id parameter comes from post routes
      //router.get("/:id", ensureAuth, postsController.getPost);
      //e.g url: http://localhost:2121/post/67f81fa38a887bf2f3080e5d
      //id === 67f81fa38a887bf2f3080e5d
      const post = await Post.findById(req.params.id);
      if (!post) {
        console.error("Post not found");
        return res.redirect("/feed");
      }
      res.render("post.ejs", { post: post, user: req.user });
    } catch (err) {
      console.log(err);
      res.redirect("/feed"); //redirect to feed
    }
  },
  createPost: async (req, res) => {
    try {
      // Upload image to cloudinary
      const result = await cloudinary.uploader.upload(req.file.path);

      //media are stored on cloudinary, above request responds with url to media
      //and the media id that you will need when deleting content 
      await Post.create({
        title: req.body.title,
        image: result.secure_url,
        cloudinaryId: result.public_id,
        caption: req.body.caption,
        likes: 0,
        user: req.user.id,
      });
      console.log("Post has been added!");
      res.redirect("/profile");
    } catch (err) {
      console.log(err);
    }
  },
  likePost: async (req, res) => {
    try {
      await Post.findOneAndUpdate(
        { _id: req.params.id },
        {
          $inc: { likes: 1 },
        }
      );
      console.log("Likes +1");
      res.redirect(`/post/${req.params.id}`);
    } catch (err) {
      console.log(err);
    }
  },
  deletePost: async (req, res) => {
    try {
      // Find post by id
      let post = await Post.findById(req.params.id);
      // Check if post exists
      if (!post) {
        console.error("Post not found");
        return res.redirect("/profile");
      }

      // Delete image from cloudinary
      await cloudinary.uploader.destroy(post.cloudinaryId);
      // Delete post from db
      await Post.findByIdAndDelete(req.params.id);

      console.log("Deleted Post");
      res.redirect("/profile");
    } catch (err) {
      console.error("Error deleting post:", err);
      res.redirect("/profile");
    }
  },
};
