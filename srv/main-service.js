const cds = require('@sap/cds');
const { response } = require('express');

module.exports = (async (srv) => {

    const proxyS4 = await cds.connect.to('LAB2CASH_PROXY');
    const db = await cds.connect.to('db');
    const dbe = db.entities;
    const s4e = proxyS4.entities;
    const { Parameters, Customers, Wallets, Orders } = dbe('cap.l2l.lab2cash');


    srv.on('READ', 'A_BusinessPartner', (req) => proxyS4.run(req.query));

    srv.before('CREATE', 'A_SalesOrder', async (req) => {
        const { PurchaseOrderByCustomer, TotalNetAmount, Order } = req.data;

        const parameters = await SELECT.one.from(Parameters);

        // 1 - Está usando cashback? O cashback está ativado?
        if (Order.applied_cashback > 0 && !parameters.is_cashback_active) {
            return req.error(422, 'Cashback is not active.');
        }

        // 2 - Business Partner existe no S/4?        
        const bp = await proxyS4.run(
            SELECT.one(s4e.A_BusinessPartner).where({ BusinessPartner: PurchaseOrderByCustomer })
        )

        if (!bp) {
            //return req.error(404, "Business Partner not found.");
        }

        // 3 - Customer existe no HANA?
        let customer = await SELECT.one().from(Customers).where({ business_partner_id: PurchaseOrderByCustomer })

        if (!customer) {
            const response = await INSERT.into(Customers).entries({
                business_partner_id: PurchaseOrderByCustomer,
                wallet: {
                    balance: 10
                }
            })
            console.log(`Customer created: ${JSON.stringify(response)}`);
        }

        //customer = await SELECT.one().from(Customers).where({ business_partner_id: PurchaseOrderByCustomer });
        customer = await SELECT.one`from ${Customers} {
            *, wallet {
                *
            }
        } where business_partner_id = ${PurchaseOrderByCustomer}`;

        if (!customer) {
            return req.error(422, 'Customer could not be craeted in Hana');
        }

        // 4 - Está usando cashback? Tem saldo em carteira?
        if (Order.applied_cashback > customer.wallet.balance) {
            return req.error(422, "Applied cashback is greater than customer wallet balance.");
        }

        // 5 - Está usando cashback? O cashback excede o limite de resgate?
        const allowedRedemptionLimit = TotalNetAmount * parameters.cashback_redemption_limit;

        if (Order.applied_cashback > allowedRedemptionLimit) {
            return req.error(422, 'Cashback redemption limit exceed.')
        }

        return req.error(422, 'End');
    });
    srv.on('CREATE', 'A_SalesOrder', async (req) => {
        // 1- Fazer os selects
        const {
            SalesOrderType,
            PurchaseOrderByCustomer,
            SoldToParty,
            TotalNetAmount,
            to_Item,
            Order
        } = req.data;

        const customer = await SELECT.one`from ${Customers} {
            *, wallet {
                *
            }
        } where business_partner_id = ${PurchaseOrderByCustomer}`;

        const orderAmountInCents = (TotalNetAmount * 100) - Order.applied_cashback;

        const parameters = await SELECT.one(Parameters);

        const receivedCashbackInCents = orderAmountInCents * (parameters.cashback_return / 100);

        const customerWallet = await SELECT.one(Wallets).where({ customer_ID: customer.ID })

        // 2 - Criar a Sales Order no S/4
        const salesOrder = proxyS4.run(
            INSERT({
                SalesOrderType,
                PurchaseOrderByCustomer,
                SoldToParty,
                TotalNetAmount,
                to_Item,
            }).into(s4e.A_SalesOrder)
        );

        // 3 - Criar as transactions
        const transactions = [];
        if (Order.applied_cashback > 0) {
            transactions.push({
                type: 'REDEMPTION',
                amount: Order.applied_cashback,
                wallet: {
                    ID: customer.wallet_ID
                }
            });
        }

        if (receivedCashbackInCents > 0) {
            transactions.push({
                type: 'CREDIT',
                amount: receivedCashbackInCents,
                wallet: {
                    ID: customer.wallet_ID
                }
            });
        }

        // console.log(JSON.stringify)

        // 4 - Criar a order (CAP)
        const orderRes = await INSERT({
            sales_order_id: salesOrder.SalesOrder,
            applied_cashback: Order.applied_cashback,
            amount: orderAmountInCents,
            customer_ID: customer.ID,
            transactions: transactions
        }).into(Orders);

        // 5 - Atualizar o saldo da carteira
        const transactionsAmount = transactions.reduce((accumulator, current) => {
            const value = current.type  === 'REDEMPTION'
                ? accumulator - current.amount
                : accumulator + current.amount

            return value;
        }, 0)

        const updatedBalance = customerWallet.balance + transactionsAmount;

        const walletRes = await UPDATE(Wallets)
            .set({ balance: updatedBalance })
            .where({ ID: customer.wallet.ID })

        console.log(`Balance updated: $ ${(updatedBalance / 100).toFixed(2)}`);
        await srv.emit('balanceUpdated', { wallet_ID: customer.wallet.ID });

        return salesOrder;
    });

    srv.on('balanceUpdated', async (req) => {
        const { wallet_ID } = req.data;

        await SELECT.one(Wallets).where({ ID: wallet_ID });
    });

    srv.on('READ', 'A_SalesOrder', (req) => proxyS4.run(req.query));

    srv.on('READ', 'A_BusinessPartner', (req) => proxyS4.run(req.query));

    srv.on('READ', 'A_Product', (req) => proxyS4.run(req.query));

    srv.on('getParameters', async (req) => {

        const { Parameters } = dbe('cap.l2l.lab2cash');

        const parameters = await SELECT.one().from(Parameters);

        return parameters;
    });

    srv.on('updateParameters', async (req) => {
        console.log('estive aqui');

        const { Parameters } = dbe('cap.l2l.lab2cash');
        const { parameters } = req.data;

        await UPDATE(Parameters).set(parameters);

        return parameters;
    })
})