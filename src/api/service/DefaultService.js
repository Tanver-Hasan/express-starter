'use strict';


/**
 * Create a new product
 *
 * body ProductInput 
 * returns Product
 **/
exports.createProduct = function (body) {
  return new Promise(function (resolve, reject) {
    var examples = {};
    examples['application/json'] = {
      "price": 19.99,
      "name": "Sample Product",
      "description": "This is a sample product description.",
      "inStock": true,
      "id": 1
    };
    if (Object.keys(examples).length > 0) {
      resolve(examples[Object.keys(examples)[0]]);
    } else {
      resolve();
    }
  });
}

/**
 * Health check
 *
 * returns object
 **/
exports.getHealth = function () {
  return new Promise(function (resolve) {
    resolve({
      status: 'ok',
      message: 'Service is healthy',
      timestamp: new Date().toISOString(),
    });
  });
}


/**
 * Delete a product
 *
 * productId Integer 
 * no response value expected for this operation
 **/
exports.deleteProduct = function (productId) {
  return new Promise(function (resolve, reject) {
    resolve();
  });
}


/**
 * Retrieve all products
 *
 * returns List
 **/
exports.getAllProducts = function () {
  return new Promise(function (resolve, reject) {
    var examples = {};
    examples['application/json'] = [{
      "price": 19.99,
      "name": "Sample Product",
      "description": "This is a sample product description.",
      "inStock": true,
      "id": 1
    }, {
      "price": 19.99,
      "name": "Sample Product",
      "description": "This is a sample product description.",
      "inStock": true,
      "id": 1
    }];
    if (Object.keys(examples).length > 0) {
      resolve(examples[Object.keys(examples)[0]]);
    } else {
      resolve();
    }
  });
}


/**
 * Retrieve a single product by ID
 *
 * productId Integer 
 * returns Product
 **/
exports.getProductById = function (productId) {
  return new Promise(function (resolve, reject) {
    var examples = {};
    examples['application/json'] = {
      "price": 19.99,
      "name": "Sample Product",
      "description": "This is a sample product description.",
      "inStock": true,
      "id": 1
    };
    if (Object.keys(examples).length > 0) {
      resolve(examples[Object.keys(examples)[0]]);
    } else {
      resolve();
    }
  });
}


/**
 * Update an existing product
 *
 * body ProductInput 
 * productId Integer 
 * returns Product
 **/
exports.updateProduct = function (body, productId) {
  return new Promise(function (resolve, reject) {
    var examples = {};
    examples['application/json'] = {
      "price": 19.99,
      "name": "Sample Product",
      "description": "This is a sample product description.",
      "inStock": true,
      "id": 1
    };
    if (Object.keys(examples).length > 0) {
      resolve(examples[Object.keys(examples)[0]]);
    } else {
      resolve();
    }
  });
}
