# SafeCheck: Consumer Product Safety App

## Overview

SafeCheck is a mobile application designed to make product recall participation easier, faster, and more engaging for consumers. The app helps users check whether a product has been recalled, save products to an inventory for future monitoring, report safety concerns, and receive product safety guidance through an AI assistant.

The goal of SafeCheck is to reduce the barriers that prevent consumers from participating in recalls. Many consumers may not feel urgency, may struggle with complicated product model names, or may not have an easy way to stay engaged with recall information. SafeCheck addresses these issues by creating a simple mobile experience focused on scanning, searching, tracking, and community participation.

## Demo Video

[Watch the SafeCheck demo video][ file:///C:/Users/eyuel/Downloads/ScreenRecording_05-04-2026%2003-54-37_1%20(2).MP4](https://drive.google.com/file/d/1H1Da7cTi2vVk12-WsdKMOzUiQw_g0khh/view?usp=sharing)

## Features

* **Product Scan and Search**
  Users can check products by scanning a barcode or searching by product name.

* **Recall Results**
  The app shows whether a product is recalled or considered safe based on available recall data.

* **Product Inventory**
  Users can save products they own so the app can help monitor them for future recall updates.

* **Community Safety Reports**
  Users can report possible product safety concerns and stay connected with CPSC-related safety updates.

* **AI Assistant**
  Users can ask plain-language product safety questions and receive helpful guidance.

* **Progress and Rewards**
  Users can earn points, badges, and safety status levels to encourage continued participation.

* **Community Engagement**
  The app supports safety-based engagement through badges, leaderboards, and possible community recall challenges.

## Tech Stack

### Frontend

* React Native
* JavaScript

### Backend

* AWS API Gateway
* AWS Lambda
* Amazon Cognito
* Amazon DynamoDB
* Amazon S3
* Amazon Bedrock
* Amazon CloudWatch
* AWS IAM
* External recall/product data APIs

## Backend Architecture
<img width="979" height="617" alt="image" src="https://github.com/user-attachments/assets/66f9ea8d-1d9b-4ff0-902e-e2567c355167" />

The backend is built using AWS services. The mobile app sends requests through API Gateway, which connects to AWS Lambda functions for backend logic. Amazon Cognito handles user sign-in and sign-up. DynamoDB stores user data, product inventory, recall checks, and community-related information. Amazon S3 is used for file storage, while CloudWatch supports logging and monitoring. Amazon Bedrock powers the AI assistant, and IAM manages permissions between AWS services.

## Purpose

The purpose of SafeCheck is to improve consumer participation in product recalls by making recall information easier to access and act on. Instead of relying only on traditional recall notices, SafeCheck gives users a more interactive way to check products, track safety information, and participate in community safety efforts.

## Target Users

SafeCheck is designed for community-active safety advocates, including people involved in neighborhoods, schools, churches, parent groups, thrift stores, and volunteer networks. These users are likely to care about local safety and may be motivated by civic responsibility, recognition, and the ability to help protect others.

## Data and Analytics

SafeCheck can help collect useful safety-related data, such as:

* Products users scan most often
* Recall matches found by users
* Community safety reports
* Recalled products that may still be in homes over time

This information can help identify where recalled products may still be in use and what types of products consumers are most concerned about.

## Future Improvements

* Improve barcode scanning accuracy
* Add push notifications for saved product recalls
* Expand AI assistant capabilities
* Add more detailed user safety dashboards
* Improve leaderboard and badge systems
* Add location-based community recall insights
* Connect to more recall and product databases
* Improve accessibility and mobile design

## Authors

**Eyuel Abebe**
**Vrushab Shreenidhi**

## Project Status

This project is currently a prototype/demo concept for improving consumer recall participation through a mobile app experience.

## License

This project is for educational and demonstration purposes.
