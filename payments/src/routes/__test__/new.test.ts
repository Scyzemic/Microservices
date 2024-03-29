import mongoose from 'mongoose';
import request from 'supertest';
import { OrderStatus } from '@gmticketing/common';
import { app } from '../../app';
import { Order } from '../../models/order';
import { stripe } from '../../stripe';
import { Payment } from '../../models/payment';

it('returns 404 when purchasing an order that does not exist', async () => {
	await request(app)
		.post('/api/payments')
		.set('Cookie', global.signIn())
		.send({
			token: 'asdf',
			orderId: new mongoose.Types.ObjectId().toHexString(),
		})
		.expect(404);
});

it("returns 401 when purchasing an order that doesn't belong to the user", async () => {
	const order = Order.build({
		id: new mongoose.Types.ObjectId().toHexString(),
		userId: new mongoose.Types.ObjectId().toHexString(),
		version: 0,
		price: 20,
		status: OrderStatus.Created,
	});
	await order.save();

	await request(app)
		.post('/api/payments')
		.set('Cookie', global.signIn())
		.send({
			token: 'asdf',
			orderId: order.id,
		})
		.expect(401);
});

it('returns 400 when purchasing a cancelled order', async () => {
	const userId = new mongoose.Types.ObjectId().toHexString();
	const order = Order.build({
		id: new mongoose.Types.ObjectId().toHexString(),
		userId,
		version: 0,
		price: 20,
		status: OrderStatus.Cancelled,
	});
	await order.save();

	await request(app)
		.post('/api/payments')
		.set('Cookie', global.signIn(userId))
		.send({
			token: 'asdf',
			orderId: order.id,
		})
		.expect(400);
});

it('returns a 201 with valid inputs', async () => {
	// this test mixes tests for the stripe api and the payment model..
	// it would be nice if these were separate tests
	const userId = new mongoose.Types.ObjectId().toHexString();
	const price = Math.floor(Math.random() * 100000);
	const order = Order.build({
		id: new mongoose.Types.ObjectId().toHexString(),
		userId,
		version: 0,
		price,
		status: OrderStatus.Created,
	});
	await order.save();

	await request(app)
		.post('/api/payments')
		.set('Cookie', global.signIn(userId))
		.send({
			token: 'tok_visa',
			orderId: order.id,
		})
		.expect(201);

	const stripeCharges = await stripe.charges.list({ limit: 5 });
	const stripeCharge = stripeCharges.data.find(charge => {
		return charge.amount === price * 100;
	});

	expect(stripeCharge).toBeDefined();
	expect(stripeCharge!.currency).toEqual('usd');

	const payment = await Payment.findOne({
		orderId: order.id,
		stripeId: stripeCharge!.id,
	});

	expect(payment).not.toBeNull();
});
