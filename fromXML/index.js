/*jshint esversion: 8 */

const request = require('request');
const xml2js = require('xml2js');
const fs = require('fs');
const parser = new xml2js.Parser({attrkey: 'Attr'});
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

module.exports = (context, req) => {
    context.log('JavaScript HTTP trigger function processed a request.');

    const {sourceUrl, expand, outFilename} = req.query || req.body;
    
    getOptions = {
        method: 'GET',
        url: sourceUrl,
    };

    request(getOptions, (err, res, req) => {
        if (err) {
            context.res = {
                status: res.statusCode,
                body: err,
            };
        } else {
            parser.parseString(req, (err, res) => {
                if (!err) {
                    let temp = res.EasyfattDocuments.Company[0];

                    let company = {};
                    for (const key in temp) {
                        if (temp.hasOwnProperty(key)) {
                            company['Company.' + key] = temp[key][0];
                        }
                    }

                    temp = res.EasyfattDocuments.Documents[0].Document;
                    let documents = [];

                    for (let index = 0; index < temp.length; index++) {
                        const item = temp[index];
                        let newEl = Object.assign({}, company);
                        let childItems = [];
                        for (const key in item) {
                            if (item.hasOwnProperty(key)) {
                                switch (key) {
                                    case 'CostVatCode':
                                        newEl['Invoice.' + key] = item[key][0]._;
                                        break;
                                    case 'Payments':
                                        if (expand === 'payments') {
                                            if (item[key][0].hasOwnProperty('Payment')) {
                                                childItems = item[key][0].Payment;
                                                for (let childIndex = 0; childIndex < childItems.length; childIndex++) {
                                                    let row = Object.assign({}, newEl);
                                                    const childItem = childItems[childIndex];
                                                    for (const childKey in childItem) {
                                                        if (childItem.hasOwnProperty(childKey)) {
                                                            row['Invoice.Payment.' + childKey] = childItem[childKey][0];
                                                        }
                                                    }
                                                    documents.push(row);
                                                }
                                            } else {
                                                documents.push(newEl);
                                            }
                                        }
                                        break;
                                    case 'Rows':
                                        if (expand === 'rows') {
                                            if (item[key][0].hasOwnProperty('Row')) {
                                                childItems = item[key][0].Row;
                                                for (let childIndex = 0; childIndex < childItems.length; childIndex++) {
                                                    let row = Object.assign({}, newEl);
                                                    const childItem = childItems[childIndex];
                                                    for (const childKey in childItem) {
                                                        if (childItem.hasOwnProperty(childKey)) {
                                                            if (childKey === 'VatCode') {
                                                                row['Invoice.Row.' + childKey] = childItem[childKey][0]._;
                                                            } else {
                                                                row['Invoice.Row.' + childKey] = childItem[childKey][0];
                                                            }
                                                        }
                                                    }
                                                    documents.push(row);
                                                }
                                            } else {
                                                documents.push(newEl);
                                            }
                                        }
                                        break;
                                    default:
                                        newEl['Invoice.' + key] = item[key][0];
                                        break;
                                }
                            }
                        }
                    }

                    const csvHeader = Object.keys(documents[0]).map((value) => {
                        return {
                            'id': value,
                            'title': value,
                        };
                    });

                    const csvWriter = createCsvWriter({
                        path: 'output.csv',
                        header: csvHeader,
                    });

                    csvWriter.writeRecords(documents)
                    .then(() => {
                        fs.readFile('output.csv', function(err,data){
                            if (!err) {
                                context.res = {
                                    status: 200,
                                    headers: {
                                        "Content-Type": "text/csv",
                                        "Content-Disposition": 'attachment;filename="'+outFilename+'"'
                                    },
                                    body: new Uint8Array(data)
                                };
                                context.done();
                            } else {
                                context.res = {
                                    status: 500,
                                    body: err.toString(),
                                };
                                context.done();
                            }
                        });
                    })
                    .catch((res) => {
                        context.res = {
                            status: 500,
                            body: res.toString(),
                        };
                        context.done();
                    });
                } else {
                    context.res = {
                        status: res.statusCode,
                        body: err,
                    };
                    context.done();
                }
            });
        }
    });
};