# Pizza Delivery API Docs
<!-- TODO Update Docs -->

**Note: Instead of mailgun, this API makes use of a service called [sendGrid](https://sendgrid.com/) to send emails (receipts) to users. However, because this API uses the sandbox version of sendGrid, it will not actually send the email, but respond with an `OK` with a status code of 200**

---

This API enables you to:

- Create users in the `/users` endpoint
- Create tokens and facilitate login in the `/tokens` endpoint
- Make orders and view the menu in the `/order` and `/order/menu` endpoints
- Pay for your order in the `/checkout` endpoint

In order to make use of this API you would to run the script with these environment variables defined:

- STRIPE_TEST_KEY
- SENDGRID_TEST_KEY
- MY_SENDER_EMAIL

**Note: The base url is `http://localhost:5000` in production, and `http://localhost:3000` in development.**

In order to use of the HTTPS protocol you must include an _https_ folder with _key.pem_ and _cert.pem_ files.

## /users

### POST

This type of request, fo this route, creates a new user and provides them with a token.
It only needs a body, the body should be a stringified object with mandatory properties, such as:

- _name_ - The new user's name (string)
- _password_: The user's password (string)
- _email_ - The user's email to send the receipt to. (string)
- _streetAddress_: The user's location for delivery. (string)

If any of these fields are missing, the server will respond with an error and status Code.

Request Example

```
POST basUrl/users

// No optional data

// Does not require a token to be performed

// Body template
{
  name: name of user,
  email: user's email, must be a valid email,
  password: desired password,
  streetAddress: the place to deliver their order, must be a valid address
}
```

### GET

To fetch user data

This type of request requires the headers to have the token of the user whose data needs to be fetched, to validate whether the user's session is still valid.

For this request, the user, whose data needs to be retrieved, must have his/her email passed as a query string parameter

Request Example

```
GET baseUrl/users?email=desiredUserEmail

// No optional data

// headers
token: Generated User token
```

For security purposes, the user's password and token will not be present in the output.

### PUT

To update user data. This request requires the user's email as a query string parameter, and a body similar to that of the `POST` request. Except, only on of those fields is necessary, you can have all of them but only one is needed for a successful request.

Request Example

```
PUT baseUrl/users?email=desiredUserEmail

// headers
token: Generated User token

// Body example. Must contain at least one property
{
  name: new name,
  password: new password,
  email: new email,
  streetAddress: new streetAddress
}
```

### DELETE

Deletes a user from the system. This request deletes all of a specified user's data. Requires the user's token in the headers, and the user's email as a query string parameter.

Request Example

```
DELETE baseUrl/users?email=desiredUserEmail

// No optional data

// headers
token: Generated User token
```

## /tokens

### POST

Creates a new token for an existing user, if their token has expired because each user can only have a single token. **Tokens are valid for an hour only**.

This request requires the user's credentials: email and password. Having a token in the headers of the request is optional.

Request Example

```
POST baseUrl/tokens

// Optional Data
  // headers
    token: generated token

// Body example
{
  email: user's email,
  password: user's password
}
```

### Get

Retrieves the non-sensitive data of a user's token. Requires the token Id to be specified as a query string parameter, and it does not have any optional data

Request Example

```
GET baseUrl/tokens?Id=token Id

// headers
  token: generated token

// No optional data or body
```

### PUT

Extends a user's session by an hour by extending the expiration time of their token by an hour.

Request requires user's email to be specified as a query string parameter, and a body containing the Id of the token to extend as well as `toExtend` which is a boolean property that extends the expiration time of the token by an hour **ONLY**.

Request Example

```
PUT baseUrl/tokens?email=user's email

// No optional data

// headers
  token: generated token

// Body example
{
  Id: tokenId,
  toExtend: true or false
}
```

_Note: If `toExtend` is `false`, nothing happens_

### DELETE

Deletes a token. Requires the token's Id as a query string parameter; it needs no optional data or request body

Request Example

```
DELETE baseUrl/tokens?Id=tokenId

// no optional data

// headers
  token: generated token
```

## /order

This endpoint contains the subroute `/menu` which list all the items within the menu-- these items are hardcoded within .data/menu/menu.json.

`/menu` takes the a logged in user's email as a query string parameter and has no optional data requirements. Additionally, only a `GET` request can be made to this route, any other type of request will fail.

Request Example

```
GET baseUrl/order/menu?email=user email

// No optional data

//header
token: generated token (valid)
```

### POST

Enables a logged in user to create an order. Required is the current user's email as a query string parameter and in the body of the request is an object with an orders property which is an array of available menu items.
If there is an item within the array that isn't in the menu, an error occurs and the order isn't saved.

Request Example

```
POST baseUrl/order?email=user email

// No optional data

Body Example
{
  orders: ["Large Fries", "Coke" ...etc]
}

// headers
token: generated token
```

### GET

Retrieves the cart of the current user. Requires the current user's email as a query string parameter; It does not have any optional data.

Request Example

```
GET baseUrl/order?email=user email

// No optional data

// headers
token: generated token Id (valid)
```

### PUT

Updates a user's cart. _The cart limit is 10_, if a user's cart count is below 10 they can add more items with this request, otherwise they cannot.

Requires the same input as the `POST` request does.

### Delete

Empties the user's cart. This request requires the current user's email as a query string parameter and has no optional data.

Request Example

```
DELETE baseUrl/order?email=user email

// No optional data

// headers
token: generated token Id (valid)
```

## /checkout

This endpoint only accepts a `POST` request. This request requires the user's email as a query string parameter, and a body with an object containing two properties `card` and `currency`, there is no optional data.

Request Example

```
POST baseUrl/checkout?email=user email
// No optional data

// headers
token: generated token Id (valid)

Body Example
{
  currency: 'usd' or 'gdp', any other value will not be accepted
  card: 'tok_mastercard' or 'tok_visa', any other value will not be accepted
}
```
