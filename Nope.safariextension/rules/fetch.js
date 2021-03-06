var https = require("https")
var fs = require("fs")
var path = require("path")
var exec = require("child_process").exec;

var excludes = JSON.parse(fs.readFileSync(path.resolve(__dirname, "excludes.json"), "utf8"))["excludes"]
var extras = JSON.parse(fs.readFileSync(path.resolve(__dirname, "extras.json"), "utf8"))

function updateRules() {
  var body = ""
  var options = {
    host: "services.disconnect.me",
    port: 443,
    path: "/disconnect-plaintext.json",
    method: "GET"
  }

  var request = https.request(options, function(result) {
    result.on("data", function(data) {
      body += data
    })

    result.on("end", function() {
      generateRules(body)
    })
  })

  request.end()

  request.on("error", function(e) {
    console.error(e)
  })
}

function generateRules(data) {
  disconnectData = JSON.parse(data)
  massagedData = massageData(disconnectData)
  categoryNames = ["Advertising", "Analytics", "Social"]

  for (var i in categoryNames) {
    var domainList = []
    var categoryName = categoryNames[i]

    for (var i in massagedData[categoryName]) {
      entry = massagedData[categoryName][i]
      domainList = domainList.concat(flattenEntry(entry))
      domainList = domainList.filter(function(i) { return excludes.indexOf(i) < 0 })

      if (extras[categoryName] != undefined) {
        domainList = domainList.filter(function(i) { return extras[categoryName].indexOf(i) < 0 })
        domainList = domainList.concat(extras[categoryName])
      }
    }

    rulesData = domainList.map(function(domain) {
      return blocklistEntry(domain)
    })

    fileData = categoryName.toLowerCase() + "Rules = " + JSON.stringify(rulesData, null, " ")

    fs.writeFileSync(path.resolve(__dirname, "generated/" + categoryName.toLowerCase() + "_rules.js"), fileData)
    console.log("Parsed " + domainList.length + " entries in the " + categoryName + " category.")
    updateRuleCount(domainList.length, categoryName)
  }
}

function updateRuleCount(count, category) {
  initialPlistIndex = 3
  label = ""

  switch (category) {
  case "Analytics":
    initialPlistIndex += 1
    label = "Block Tracking"
    break
  case "Social":
    initialPlistIndex += 2
    label = "Block Social"
    break
  default:
    label = "Block Advertising"
    break
  }

  plistArgument = "Set " + initialPlistIndex + ":Title " + label + " (" + count + " Rules)"
  command = "/usr/libexec/PlistBuddy -c '" + plistArgument + "' Nope.safariextension/Settings.plist"
  exec(command)
}

function massageData(data) {
  var categories = data.categories
  if (categories === undefined) { return data }

  delete categories["Legacy Disconnect"]
  delete categories["Legacy Content"]

  var disconnect = categories["Disconnect"]
  delete categories["Disconnect"]

  var facebook = findElement("Facebook", disconnect)
  var twitter = findElement("Twitter", disconnect)
  categories["Social"].push(facebook)
  categories["Social"].push(twitter)

  var googleRules = JSON.parse(fs.readFileSync(path.resolve(__dirname, "google.json"), "utf8"))["categories"]
  var categoryNames = ["Advertising", "Analytics", "Social"]

  for (var i in categoryNames) {
    var categoryName = categoryNames[i]
    categories[categoryName].push(googleRules[categoryName][0])
  }

  return categories
}

function flattenEntry(entry) {
  name = Object.keys(entry)[0]
  domain = Object.keys(entry[name])[0]
  return entry[name][domain]
}

function findElement(name, jsonArray) {
  for (var i in jsonArray) {
    if (Object.keys(jsonArray[i])[0] == name) {
      return jsonArray[i]
    }
  }
}

function urlFilter(domain) {
  return "^[^:]+://+([^:/]+\\.)?" + domain.replace(/\./g, "\\.").replace(/[^a-zA-Z0-9\\\./-]/g, "") + "[:/]"
}

function unlessDomain(domains) {
  return domains.map(function(domain) {
    return "*" + domain
  })
}

function blocklistEntry(domain) {
  return {
    "trigger": {
      "url-filter": urlFilter(domain),
      "url-filter-is-case-sensitive": true,
      "resource-type": ["image", "style-sheet", "script", "font", "raw", "svg-document", "media", "popup"],
      "load-type": ["third-party"]
    },
    "action": {
      "type": "block"
    }
  }
}

function test() {
  var disconnectFake = fs.readFileSync(path.resolve(__dirname, "sample.json"), "utf8")
  generateRules(disconnectFake)
}

updateRules()
