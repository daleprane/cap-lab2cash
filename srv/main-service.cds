using { LAB2CASH_PROXY } from './external/LAB2CASH_PROXY';
using { cap.l2l.lab2cash as db } from '../db/schema/schema';

service Main @(path: '/main') {

    @restrict: [{
        grant: [
            CREATE,
            READ    ]
    }]
    entity A_SalesOrder as projection on LAB2CASH_PROXY.A_SalesOrder;

    @restrict: [{
        grant: [
            CREATE,
            READ
        ]
    }]
    extend projection A_SalesOrder with {
        to_Item: redirected to A_SalesOrderItem,
        Order: Association to one Orders on Order.sales_order_id = SalesOrder
    };

    @restrict: [{
        grant: [
            CREATE,
            READ
        ]
    }]    
    entity Orders as projection on db.Orders;

    @restrict: [{
        grant: [
            CREATE,
            READ
        ]
    }]
    entity A_SalesOrderItem as projection on LAB2CASH_PROXY.A_SalesOrderItem;

    @readonly
    entity A_BusinessPartner as projection on LAB2CASH_PROXY.A_BusinessPartner;

    @readonly
    entity A_Product as projection on LAB2CASH_PROXY.A_Product{
        *,
        to_Description: redirected to A_ProductDescription
    };

    @readonly
    entity A_ProductDescription as projection on LAB2CASH_PROXY.A_ProductDescription;
    
    @restrict: [{
        grant: [
            CREATE,
            READ
        ]
    }]
    entity Customers as projection on db.Customers;
    
    @restrict: [{
        grant: [
            CREATE,
            READ
        ]
    }]
    entity Wallets as projection on db.Wallets;
    
    event balanceUpdated : {
        wallet_ID   : String;

    }

    @restrict: [{
        grant: [
            UPDATE,
            READ
        ]
    }]
    entity Parameters as projection on db.Parameters;
    
    function getParameters( ) returns Parameters;

    action updateParameters( parameters: {
        is_cashback_active          : Boolean;
        cashback_return             : Decimal;
        cashback_redemption_limit   : Decimal;
    }) returns Parameters;
}
