require('colors');
const fs = require('fs');
const config = require('config');
const { prompt } = require('enquirer');
const OASNormalize = require('oas-normalize');
const promptOpts = require('../lib/prompts');
const APIError = require('../lib/apiError');
const { getProjectVersion } = require('../lib/versionSelect');
const fetch = require('node-fetch');
const FormData = require('form-data');

exports.command = 'openapi';
exports.usage = 'openapi [file] [options]';
exports.description = 'Upload, or sync, your Swagger/OpenAPI file to ReadMe.';
exports.category = 'apis';
exports.position = 1;

exports.hiddenArgs = ['token', 'spec'];
exports.args = [
  {
    name: 'key',
    type: String,
    description: 'Project API key',
  },
  {
    name: 'id',
    type: String,
    description: `Unique identifier for your specification. Use this if you're resyncing an existing specification`,
  },
  {
    name: 'token',
    type: String,
    description: 'Project token. Deprecated, please use `--key` instead',
  },
  {
    name: 'version',
    type: String,
    description: 'Project version',
  },
  {
    name: 'spec',
    type: String,
    defaultOption: true,
  },
];

exports.run = async function (opts) {
  const { spec, version } = opts;
  let { key, id } = opts;
  let selectedVersion;
  let isUpdate;

  if (!key && opts.token) {
    console.warn('Using `rdme` with --token has been deprecated. Please use `--key` and `--id` instead.');

    [key, id] = opts.token.split('-');
  }

  if (!key) {
    return Promise.reject(new Error('No project API key provided. Please use `--key`.'));
  }

  const encodedString = Buffer.from(`${key}:`).toString('base64');

  async function callApi(specPath, versionCleaned) {
    // @todo Tailor messaging to what is actually being handled here. If the user is uploading an OpenAPI file, never mention that they uploaded/updated a Swagger file.

    async function success(data) {
      const message = !isUpdate
        ? "You've successfully uploaded a new Swagger file to your ReadMe project!"
        : "You've successfully updated a Swagger file on your ReadMe project!";

      const body = await data.json();

      console.log(
        [
          message,
          '',
          `\t${`${data.headers.get('location')}`.green}`,
          '',
          'To update your Swagger or OpenAPI file, run the following:',
          '',
          // eslint-disable-next-line no-underscore-dangle
          `\trdme openapi FILE --key=${key} --id=${body._id}`.green,
        ].join('\n')
      );
    }

    async function error(err) {
      try {
        const parsedError = await err.json();
        return Promise.reject(new APIError(parsedError));
      } catch (e) {
        if (e.message.includes('Unexpected token < in JSON')) {
          return Promise.reject(
            new Error(
              "We're sorry, your upload request timed out. Please try again or split your file up into smaller chunks."
            )
          );
        }

        return Promise.reject(new Error('There was an error uploading!'));
      }
    }

    let bundledSpec;
    const oas = new OASNormalize(specPath, { enablePaths: true });
    await oas.validate().catch(err => {
      return Promise.reject(err);
    });
    await oas
      .bundle()
      .then(res => {
        bundledSpec = JSON.stringify(res);
      })
      .catch(err => {
        return Promise.reject(err);
      });

    const formData = new FormData();
    formData.append('spec', bundledSpec);

    const options = {
      headers: {
        'x-readme-version': versionCleaned,
        'x-readme-source': 'cli',
        Authorization: `Basic ${encodedString}`,
        Accept: 'application/json',
      },
      body: formData,
    };

    function createSpec() {
      options.method = 'post';
      return fetch(`${config.host}/api/v1/api-specification`, options)
        .then(res => {
          if (res.ok) return success(res);
          return error(res);
        })
        .catch(err => console.log(`\n ${err.message}\n`.red));
    }

    function updateSpec(specId) {
      isUpdate = true;
      options.method = 'put';
      return fetch(`${config.host}/api/v1/api-specification/${specId}`, options)
        .then(res => {
          if (res.ok) return success(res);
          return error(res);
        })
        .catch(err => console.log(`\n ${err.message}\n`.red));
    }

    /*
      Create a new OAS file in Readme:
        - Enter flow if user does not pass an id as cli arg
        - Check to see if any existing files exist with a specific version
        - If none exist, default to creating a new instance of a spec
        - If found, prompt user to either create a new spec or update an existing one
    */

    if (!id) {
      const apiSettings = await fetch(`${config.host}/api/v1/api-specification`, {
        method: 'get',
        headers: {
          'x-readme-version': versionCleaned,
          Authorization: `Basic ${encodedString}`,
        },
      }).then(res => res.json());

      if (!apiSettings.length) return createSpec();

      const { option, specId } = await prompt(promptOpts.createOasPrompt(apiSettings));
      return option === 'create' ? createSpec() : updateSpec(specId);
    }

    /*
      Update an existing OAS file in Readme:
        - Enter flow if user passes an id as cli arg
    */
    return updateSpec(id);
  }

  if (!id) {
    selectedVersion = await getProjectVersion(version, key, true).catch(e => {
      return Promise.reject(e);
    });
  }

  if (spec) {
    return callApi(spec, selectedVersion);
  }

  // If the user didn't supply a specification, let's try to locate what they've got, and upload
  // that. If they don't have any, let's let the user know how they can get one going.
  return new Promise((resolve, reject) => {
    ['swagger.json', 'swagger.yaml', 'openapi.json', 'openapi.yaml'].forEach(file => {
      if (!fs.existsSync(file)) {
        return;
      }

      console.log(`We found ${file} and are attempting to upload it.`.yellow);
      resolve(callApi(file, selectedVersion));
    });

    reject(
      new Error(
        "We couldn't find a Swagger or OpenAPI file.\n\n" +
          'Run `rdme openapi ./path/to/file` to upload an existing file or `rdme oas init` to create a fresh one!'
      )
    );
  });
};
