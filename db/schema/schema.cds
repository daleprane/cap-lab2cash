namespace cap.l2l.lab2cash;

using { cuid, managed } from '@sap/cds/common';

entity Orders : cuid, managed {
    key sales_order_id  : Integer;
    customer            : Association to one Customers;
    applied_cashback    : Integer;
    amount              : Integer;
    transactions        : Composition of many Orders.Transactions on transactions.order = $self;
}

entity Orders.Transactions : cuid {
    order   : Association to one Orders;
    wallet  : Association to one Wallets;
    type    : String enum { CREDIT; REDEMPTION; };
    amount  : Integer;
}

entity Customers : cuid, managed {    
    wallet              : Composition of one Wallets on wallet.customer = $self;
    Orders              : Association to many Orders on Orders.customer = $self;
    business_partner_id : Integer;
}

entity Wallets : cuid, managed {
    balance         : Integer default 0;
    customer        : Association to one Customers;
    transactions    : Association to many Orders.Transactions on transactions.wallet = $self;
}

entity Parameters : cuid {
    is_cashback_active          : Boolean;
    cashback_return             : Decimal;
    cashback_redemption_limit   : Decimal;
}

