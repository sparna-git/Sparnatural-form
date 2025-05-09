const webpack = require("webpack");
const path = require("path");
const WriteFilePlugin = require("write-file-webpack-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const DashboardPlugin = require("webpack-dashboard/plugin");
const CopyPlugin = require("copy-webpack-plugin");
const FileManagerPlugin = require("filemanager-webpack-plugin");
const BundleAnalyzerPlugin =
  require("webpack-bundle-analyzer").BundleAnalyzerPlugin;

module.exports = {
  entry: {
    "sparnatural-form": "./src/SparnaturalFormElement.ts",
  },
  output: {
    path: path.resolve(__dirname, "./dist"),
    filename: "[name].js",
    clean: true,
  },
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        use: { loader: "babel-loader" },
      },
      {
        test: /\.ts$/,
        use: {
          loader: "ts-loader",
          options: {
            allowTsInNodeModules: true,
          },
        },
      },
      {
        test: /\.(sass|scss)$/,
        use: [
          {
            loader: MiniCssExtractPlugin.loader,
          },
          {
            loader: "css-loader", // translates CSS into CommonJS
            options: {
              sourceMap: true,
            },
          },
          {
            loader: "sass-loader", // compiles Sass to CSS
            options: {
              sassOptions: {
                includePaths: ["node_modules"],
              },
            },
          },
        ],
      },
      {
        test: /\.css$/,
        use: [MiniCssExtractPlugin.loader, "css-loader"],
      },
      {
        test: /\.(png|jp(e*)g|svg|gif)$/,
        use: [
          {
            loader: "url-loader",
            options: {
              limit: 8000,
              // Convert images < 8kb to base64 strings
              // in case larger images are processed by file-loader
              name: "images/[hash]-[name].[ext]",
            },
          },
        ],
      },
    ],
  },
  resolve: {
    fallback: {
      util: require.resolve("util/"),
      buffer: require.resolve("buffer/"),
      stream: require.resolve("stream-browserify"),
      querystring: require.resolve("querystring-es3"),
      url: require.resolve("url/"),
    },
    extensions: [".tsx", ".ts", ".js"],
  },
  plugins: [
    new HtmlWebpackPlugin({
      filename: "dev-page/index.html",
      template: __dirname + "/dev-page/index.html",
      inject: false,
      templateParameters: (compilation, assets) => {
        const css = assets.css
          .map((filePath) => `<link rel="stylesheet" href="${filePath}" />`)
          .join("\n");
        const js = assets.js
          .map((filePath) => `<script src="${filePath}"></script>`)
          .join("\n");
        return { css, js };
      },
    }),

    new MiniCssExtractPlugin({
      filename: "[name].css",
      chunkFilename: "[id].css",
    }),

    new CopyPlugin({
      patterns: [
        {
          from: __dirname + "/dev-page",
          to: "dev-page",
          globOptions: {
            ignore: ["**/index.html"], // Assure-toi de ne pas copier ces fichiers déjà générés
          },
        },
      ],
    }),

    new StatoscopeWebpackPlugin(),

    // so that JQuery is automatically inserted
    new webpack.ProvidePlugin({
      $: "jquery",
      jQuery: "jquery",
    }),
    // so that stream works properly, necessary for RDFSpec provider
    // see https://stackoverflow.com/questions/68542553/webpack-5process-is-not-defined-triggered-by-stream-browserify
    new webpack.ProvidePlugin({
      process: "process/browser",
    }),
    new FileManagerPlugin({
      events: {
        onEnd: [
          {
            copy: [
              {
                source: "./hello-sparnatural-form/**",
                destination: "./dist/hello-sparnatural-form",
                options: { overwrite: true },
              },
            ],
          },
          {
            copy: [
              {
                source: "./dist/sparnatural-form.js",
                destination: "./dist/hello-sparnatural-form/",
                options: { overwrite: true },
              },
            ],
          },
          {
            copy: [
              {
                source: "./dist/sparnatural-form.css",
                destination: "./dist/hello-sparnatural-form/",
                options: { overwrite: true },
              },
            ],
          },
          {
            archive: [
              {
                source: "./dist/hello-sparnatural-form",
                destination: "./dist/hello-sparnatural-form.zip",
              },
            ],
          },
          {
            copy: [
              {
                source: "./hello-sparnatural-form/form-configs/**",
                destination: "./dist/hello-sparnatural-form/form-configs",
                options: { overwrite: true },
              },
            ],
          },
        ],
      },
    }),
  ],
  devServer: {
    static: {
      directory: path.resolve(__dirname, "./dev-page"),
    },
    historyApiFallback: true,
    hot: true,
    open: ["/dev-page"],
  },
  devtool: "source-map",
};
