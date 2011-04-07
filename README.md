About Forms
===========

Think Lotus Notes for the Web.

This is a simple forms & views based online application.
Clients can create forms and views using a visual interface (no programming)
and deploy it for a team.

Sample applications:

- Tracking timesheets, chargebacks, orders/proposals
- Surveys
- Exams

The platform is built on:

- [node.js](http://nodejs.org/) -- a fast, asynchronous server-side Javascript engine.
- [CouchDB](http://couchdb.apache.org/) -- a flexible, distributed database.

Installation
============
1. Install [CouchDB](http://couchdb.apache.org/)
2. Install [node.js](http://nodejs.org/) ([Windows binaries here](http://node-js.prcn.co.cc/))
3. Download [Forms](https://github.com/sanand0/forms/). Install it under `/forms` (for example)
4. Install these modules under `/forms/node_modules`
    - [mime](https://github.com/bentomas/node-mime)
    - [cradle](https://github.com/cloudhead/cradle)
    - [connect](https://github.com/senchalabs/connect)
    - [underscore](https://github.com/documentcloud/underscore)
5. Run `node main.js` and visit http://localhost:8401/

Create an application
=====================
Create a folder called `contacts` with the following `index.js` (a JSON file):

    {
      "database": "contacts",

      "form": {
        "person": {
          "fields": [
            { "name": "firstname", "label": "First name" },
            { "name": "lastname", "label": "Last name" },
            { "name": "phone", "label": "Phone" },
            { "name": "birthday", "label": "Birthday", "type": "date" }
          ],
          "onsubmit": "/persons"
        }
      },
      "view": {
        "persons": {
          "form": "person",
          "fields": [
            { "name": "firstname", "label": "First name" },
            { "name": "lastname", "label": "Last name" },
            { "name": "phone", "label": "Phone" }
          ],
          "actions": [
            { "text": "Add new person", "url": "/person" }
          ]
        }
      }
    }

Now create an `index.html` that has:

    <!doctype html>
    <html>
     <head><title>Contacts</title></head>
     <body><%= body %></body>
    </html>

This will create the following URLs:

- `/:app/:form`     shows the form (to create new form)
- `/:app/:form/:id` shows an existing document
- `/:app/:view`     shows the view

Application
===========
An application has the following fields:

- `database`: required. Name of the database to store documents in
- `template`: required. Name of the template file to use. Create an "index.html" that contains the text `<%= body %>` somewhere in it
- `form`: required. An object containing forms. The key is the form name. The value is a form object (see below)
- `view`: required. An object containing views. The key is the view name. The value is a view object (see below)
- `page`: optional. An object containing pages. The key is the page URL. The value is a HTML file that can contain EJS objects (see below)

Form objects
============
Each "form" object contains the following fields:

- `label`: optional. A display name for the form
- `fields`: required. A list of fields. Fields can have:

    - `name`: required. The field name. Just stick to letters (preferably lowercase), numbers and underscore. No spaces.
    - `label`: required. The display name. Any text is fine.
    - `description`: optional. The field description, as help information.
    - `type`: optional. Defaults to `text`. Can be `radio`, `checkbox`, `textarea`, `select`, `date` or `computed`
    - `values`: optional. Used for type=radio|checkbox|select. This has two forms

        - a list of values, e.g. `[1,2,3]`
        - a form lookup, e.g. `{"form": "form_name", "field": "field_to_look_up"}`

    - `formula`: optional. Used for type=computed. A text with
      [EJS templates](http://documentcloud.github.com/underscore/#template), e.g. `<%= field1*field2 %>kg`
    - `validations`: optional. A list of validations, all of which must pass. Each validation is an array of [test, message]. Tests can be:

        - `true`: indicating that the value must be filled
        - `[1,2,3]`: a list of valid values
        - `/colou?r/`: a string that should be match (treated as a regular expression)

    - `showif`: optional. A Javascript expression that defines when the field should be shown or hidden. e.g. `status != "Approved"`

- `fields`: can also contain section breaks. Each section is identified by:

    - `section`: required. The section name.
    - `description`: optional. The section description.
    - `showif`: optional. A Javascript expression that defines when the entire section should be shown or hidden. e.g. `status != "Approved"`

- `onsubmit`: a URL to send the user to once the form is submitted. This is typically a view
- `actions`: optional. A list of actions to display along with the documents. Actions can have:
    - `label`: required. The text to display for the action (templates using the variables `app`, `form` or `doc` allowed)
    - `url`: The link to visit when the action is clicked (templates using the variables `app`, `form` or `doc` allowed)
- `template`: optional. A template name to use from the application's template list. Defaults to `default`

View objects
============
Each "view" object contains the following fields:

- `label`: optional. A display name for the view
- `template`: optional. A template file to use from the application's template list.
   Use a .html file to create a HTML view, and .csv file to create a .csv view.
   These are the only two types currently supported.
- `form`: required. Name of the form to display data from. This should match a `form` name
- `filter`: optional. A Javascript expression that defines which documents should be shown. e.g. `status != "Approved"`
- `limit`: optional. The maximum number of documents to show on a single page
- `fields`: required. A list of fields. Fields can have:
    - `name`: required. The field name. Should match a field name in the form specified. Certain special fields are available:
        - `:form`: holds the name of the form
        - `:updated`: holds the last updated date and time
        - `:history`: is an array of all the changes made.
          Each change is an object with `:updated` holding the time of the change,
          and `:fields` holding an object of fields changes.
    - `label`: required. The display name. Any text is fine.
- `actions`: optional. A list of actions to display along with the documents. Actions can have:
    - `label`: required. The text to display for the action (templates using the variables `app`, `view` or `docs` allowed)
    - `url`: The link to visit when the action is clicked (templates using the variables `app`, `view` or `docs` allowed)

Pages
=====
A page is a HTML file (or any file, for that matter) that is rendered at a particular URL.
For example,

    "page": {
        "/help": "help.html"
    }

... lets you create a files in the application folder called `help.html`.
This can contain any HTML you want. In addition, two variables are passed to the file:

1. `app` -- the application itself (it's pretty much what you specify in `index.js`)
2. `param` -- the URL query parameters
3. `_` -- [underscore.js](http://documentcloud.github.com/underscore/)

You can use [EJS templates](http://documentcloud.github.com/underscore/#template) to create
templates using these variables. For example, this code in `home.html` will show all forms:

    <h2>Forms</h2>
    <% for (var form in app.forms) { %>
      <p><%= form %>
    <% } %>

URLs
====
- / is the installation home page, showing a list of *applications*
- /sample is the home page of the sample contacts manager *application*, showing a list of *forms* and *views*.
- /sample/person is a person *form*. It's a list of fields that can be populated and saved as a *document*
- /sample/person/some-number is a *document*. You can find these from the *view*, click on them, and change them
- /sample/view is a *view* that shows a number of *documents*
- /sample/view/name is the *view* sorted by the name *field* (ascending)
- /sample/view/-name is the *view* sorted by the name *field* (descending)
- /sample/static/common.js is a static file common.js served from the /sample/static folder

Authentication
==============
Three forms of authentication will be supported:
1. LDAP
2. Custom
3. Google/Yahoo/Facebook/Twitter

Permissions may be given to users to Create, Read, Update or Delete (CRUD) forms.
Each permission can be granted to zero or more users. By default, anyone can perform any of these actions.

The following groups have a special meaning:
    - `any` indicates anyone
    - `author` indicates the author of the document
    - `admin` indicates one of the administrators

For example:
    "permissions": {
      "create": ["all"],
      "read"  : ["all"],
      "update": ["author","admin"]
      "delete": ["admin"]
    }

Administration
==============
`/app-name/_admin/reload` reloads the application


TODO
====
- Cache static files
- Authentication: LDAP, OAuth2
- Filterable reports with date ranges
- Reports on order flows
- Computed fields in views (e.g. totals)
- Search
- Add types for numbers and dates. Store numbers as numbers, dates as getTime(), etc

- App builder. Pure Javascript. Just use a JSON editor.

- View count

- Access control
- Email integration & workflow
- External integration (e.g. JIRA)
- Multiedit
- Bulk exports and import

Custom views: Frequency, statistics, trends
