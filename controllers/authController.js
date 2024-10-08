const JWT = require('jsonwebtoken');
const { promisify } = require('util');
const catchAsync = require('../utils/catchAsync');
const User = require('../models/userModel');
const AppError = require('../utils/AppError');
const nodeMail = require("nodemailer");

const signToken = (id) =>
  JWT.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });

const createSendToken = function (id, statusCode, message, res) {
  const token = signToken(id);
  console.log(`Token created: ${token}`);
  res.cookie('JWT', token, {
    httpOnly: true,
    expires: new Date(Date.now() + (process.env.COOKIES_EXPIRES_IN * 24 * 60 * 60 * 1000)), // days to milliseconds
    sameSite: 'None',
    secure: process.env.NODE_ENV === 'production'
  });
  res.status(statusCode).json({
    status: 'success',
    message,
  });
  console.log(`Response sent with status: ${statusCode}`);
};


exports.restrictTo = function (...roles) {
  return function (req, _, next) {
    const userRole = req.user.role;
    if (roles.includes(userRole)) return next();
    next(new AppError(`You dont have permission to perform this action`));
  };
};

exports.protect = catchAsync(async (req, res, next) => {
  const token = req.cookies && req.cookies.JWT;
  if (!token)
    return next(new AppError('Please login to access this route', 401));
  const payload = await promisify(JWT.verify)(token, process.env.JWT_SECRET);
  const currentUser = await User.findById(payload.id);
  req.user = currentUser;
  next();
});

exports.login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;

  console.log(`Login attempt with email: ${email}`);
  if (!email || !password) {
    return next(new AppError('Please enter your email and password', 400));
  }

  const user = await User.findOne({ email }).select('+password');
  const isPassCorrect =
    user && (await user.checkPassword(password, user.password));

  if (!user || !isPassCorrect) {
    return next(new AppError('Either email or password is incorrect'));
  }
  console.log(`User ${email} logged in successfully`);
  createSendToken(user._id, 200, 'Login successful', res);
});

exports.signup = catchAsync(async (req, res) => {

  const newUser = await User.create({
    name: req.body.name,
    email: req.body.email,
    password: req.body.password,
    confirmPassword: req.body.confirmPassword,
    role: req.body.role
  });
console.log("saas")
  createSendToken(newUser._id, 200, 'Signup success', res);
});

exports.logout = catchAsync(async (req, res) => {
  res.cookie('JWT', '', { expires: new Date(Date.now())});
  res.redirect(302, '/login');
});

exports.info = catchAsync(async (req, res) => {
  res.status(200).json({
    status: 'success',
    data: {
      name: req.user.name,
      email: req.user.email
    }
  })
});



exports.viewAuthHandler = catchAsync(async (req, res, next) => {
  const token = req.cookies && req.cookies.JWT;
  console.log('Token from cookies:', token);

  if (token) {
    try {
      const payload = await promisify(JWT.verify)(token, process.env.JWT_SECRET);
      console.log('Payload:', payload);

      const currentUser = await User.findById(payload.id);
      console.log('Current User:', currentUser);

      if (currentUser) {
        return res.redirect(302, '/dashboard');
      }
    } catch (err) {
      console.error('Error verifying token or finding user:', err);
    }
  }

  next();
});

exports.protectView = catchAsync(async (req, res, next) => {
  const token = req.cookies && req.cookies.JWT;
  console.log('Token from cookies:', token);

  if (!token) {
    console.log('No token found, redirecting to login');
    return res.redirect(302, '/login');
  }

  if (token) {
    try {
      const payload = await promisify(JWT.verify)(token, process.env.JWT_SECRET);
      console.log('Payload:', payload);

      const currentUser = await User.findById(payload.id);
      console.log('Current User:', currentUser);

      if (!currentUser) {
        console.log('User not found, redirecting to login');
        return res.redirect(302, '/login');
      } else {
        req.user = currentUser;
      }
    } catch (err) {
      console.error('Error verifying token or finding user:', err);
      return res.redirect(302, '/login');
    }
  }

  next();
});


exports.sendMail = catchAsync(async function(req, res) {
  console.log(req.body);
  const { name, email, message } = req.body;
  if(!name || !email || !message) return res.status(400).json({
      status:'failed',
      message: 'Please fill all the fields'
  })

  const transporter = nodeMail.createTransport({
      service: "gmail",
      auth: {
          user: process.env.GMAIL_USER,
          pass: process.env.GMAIL_PASSWORD,
      },
  });

  const mailOption = {
      from: process.env.GMAIL_USER,
      to: process.env.EMAIL,
      subject: 'New message',
      html: `You got a message from 
      Email : ${email}
      Name: ${name}
      Message: ${message}`,
  };

  transporter.sendMail(mailOption, function(error, info){
      if (error) {
          return res.status(400).json({
              status:'failed',
              message: 'Error sending mail'
          })
      } else {
          return res.status(200).json({
              status:'success'
          })
      }
  });
});