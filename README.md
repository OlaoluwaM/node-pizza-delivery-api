# Pizza Delivery API Docs

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

Request example

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

Request example

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

Request example

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

Request example

```
GET baseUrl/tokens?Id=token Id

// headers
  token: generated token

// No optional data or body
```

### PUT

Extends a user's session by an hour by extending the expiration time of their token by an hour.

Request requires user's email to be specified as a query string parameter, and a body containing the Id of the token to extend as well as `toExtend` which is a boolean property that extends the expiration time of the token by an hour **ONLY**.

Request example

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

Request example

```
DELETE baseUrl/tokens?Id=tokenId

// no optional data

// headers
  token: generated token
```

## /order
