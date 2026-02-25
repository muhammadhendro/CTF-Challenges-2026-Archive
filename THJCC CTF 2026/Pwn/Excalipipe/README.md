# Excalipipe (476 pts)

**Category:** Pwn

## Description
問おう。あなたがわたしのマスターか？

(Please solve this challenge locally before connecting to the remote server.)

`nc chal-gcp.thjcc.org 13371`

---

Notice:
- The main files to focus on for this challenge are located in the src/challenge/ directory.
- When you connect to the server, it will require solving a PoW. The PoW solver script is located at solver/solve_pow.py.
- After solving PoW, the server will ask if you want to upload your exploit — provide the URL of your exploit file to do so.
- When QEMU startup, you can find your exploit at /tmp/e.
- If you have any problem about linux kernel challenge environment, please refer to the challenge others source code.

![](https://i.ibb.co/0pyYqt0n/qpmao52-Yk6-Gdp6-Q.jpg)

`Author: naup96321`

