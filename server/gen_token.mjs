import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'secreto-temporal';
const token = jwt.sign({ id: 1 }, JWT_SECRET, { expiresIn: '24h' });
console.log('Bearer ' + token);
