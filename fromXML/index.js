/*jshint esversion: 8 */

const request = require('request');
const xml2js = require('xml2js');
const parser = new xml2js.Parser({attrkey: 'Attr'});
const createCsvStringifier = require('csv-writer').createObjectCsvStringifier;

module.exports = (context, req) => {
    context.log('JavaScript HTTP trigger function processed a request.');

    //const {sourceUrl, expand, outFilename} = req.query || req.body;
    const sourceUrl = req.body.sourceUrl;
    const expand = req.body.expand;
    const outFilename = req.body.outFilename;
    
    getOptions = {
        method: 'GET',
        uri: sourceUrl,
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
                    let orderID = '', orderDate = '', shipID = '', shipDate = '';

                    try{

                    for (let index = 0; index < temp.length; index++) {
                        const item = temp[index];
                        let newEl = Object.assign({}, company);
                        let childItems = [];
                        for (const key in item) {
                            if (item.hasOwnProperty(key)) {
                                switch (key) {
                                    case 'CostVatCode':
                                        newEl['Document.' + key] = item[key][0]._;
                                        break;
                                    case 'Payments':
                                        if (expand === 'payments') {
                                            if (item[key][0].hasOwnProperty('Payment')) {
                                                childItems = item[key][0].Payment;
                                                for (let childIndex = 0; childIndex < childItems.length; childIndex++) {
                                                    let row = Object.assign({}, newEl);
                                                    const childItem = childItems[childIndex];
                                                    row['PaymentRow.RowNumber'] = childIndex + 1;
                                                    row['PaymentRow.RowID'] = "P" + "|"
                                                                                + item["DocumentType"] + "|"
                                                                                + item["Date"] + "|"
                                                                                + item["Number"] + "|"
                                                                                + item["Numbering"] + "|"
                                                                                + childIndex + 1;
                                                    for (const childKey in childItem) {
                                                        if (childItem.hasOwnProperty(childKey)) {
                                                            row['PaymentRow.' + childKey] = childItem[childKey][0];
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
                                                    row['DocumentRow.RowNumber'] = childIndex + 1;
                                                    row['DocumentRow.RowID'] = "R" + "|"
                                                                                + item["DocumentType"] + "|"
                                                                                + item["Date"] + "|"
                                                                                + item["Number"] + "|"
                                                                                + item["Numbering"] + "|"
                                                                                + childIndex + 1;
                                                    for (const childKey in childItem) {
                                                        if (childItem.hasOwnProperty(childKey)) {
                                                            if (childKey === 'VatCode') {
                                                                if (childItem[childKey][0]._ === undefined) row['DocumentRow.' + childKey] = "";
                                                                else row['DocumentRow.' + childKey] = childItem[childKey][0]._;
                                                            } else {
                                                                row['DocumentRow.' + childKey] = childItem[childKey][0];
                                                            }
                                                        }
                                                    }
                                                    if (childItem.Description[0].startsWith("** Rif. Conferma d'ordine")) {
                                                        let uDesc = childItem.Description[0].replace("** Rif. Conferma d'ordine","");
                                                        uDesc = uDesc.trim();
                                                        let [id, date] = uDesc.split(" del ");
                                                        date = date.replace(":", "");
                                                        let dates = date.split("/");
                                                        date = "";
                                                        for(let ind = dates.length - 1; ind >= 0; ind --)
                                                            date += dates[ind] + '-';
                                                        date = date.slice(0, -1);
                                                        orderID = id;
                                                        orderDate = date;
                                                    } else if (childItem.Description[0].startsWith("** Rif. Doc. di trasporto")) {
                                                        let uDesc = childItem.Description[0].replace("** Rif. Doc. di trasporto","");
                                                        uDesc = uDesc.trim();
                                                        let [id, date] = uDesc.split(" del ");
                                                        date = date.replace(":", "");
                                                        let dates = date.split("/");
                                                        date = "";
                                                        for(let ind = dates.length - 1; ind >= 0; ind --)
                                                            date += dates[ind] + '-';
                                                        date = date.slice(0, -1);
                                                        shipID = id;
                                                        shipDate = date;
                                                    }
                                                    row['DocumentRow.OrderID'] = orderID;
                                                    row['DocumentRow.OrderDate'] = orderDate;
                                                    row['DocumentRow.ShipmentID'] = shipID;
                                                    row['DocumentRow.ShipmentDate'] = shipDate;
                                                    documents.push(row);
                                                }
                                            } else {
                                                documents.push(newEl);
                                            }
                                        }
                                        break;
                                    default:
                                        newEl['Document.' + key] = item[key][0];
                                        break;
                                }
                            }
                        }
                    }
                }
                    catch(e)
                    {
                        console.log("Error: " + e);
                    }
                    const csvHeader = Object.keys(documents[0]).map((value) => {
                        return {
                            'id': value,
                            'title': value,
                        };
                    });

                    const csvStringifier = createCsvStringifier({
                        header: csvHeader,
                    });

                    let bufStr = csvStringifier.getHeaderString();
                    bufStr += csvStringifier.stringifyRecords(documents);
                    const buf = Buffer.from(bufStr);

                    context.res = {
                        status: 200,
                        headers: {
                            "Content-Type": "text/csv",
                            "Content-Disposition": 'attachment;filename="'+outFilename+'"'
                        },
                        body: new Uint8Array(buf)
                    };
                    context.done();
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