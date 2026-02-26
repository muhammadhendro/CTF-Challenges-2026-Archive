# I love lean!! (385 pts)

**Category:** crypto

**Author:** xvade

## Description
I hear hear memory effecient modular exponentiation is important for crypto. Does it work though? The server is running
```
set_option warningAsError true
def mem_effecient_mod_exp (b e m c : Nat) : Nat :=
  if e > 0 then
    mem_effecient_mod_exp b (e - 1) m ((b * c) % m)
  else
    c % m
theorem it_works (b e m : Nat) : mem_effecient_mod_exp b e m 1 = (b ^ e) % m := <YOUR CODE HERE>
```

If you can make the Lean file typecheck, you get the flag.

Tip: Use [live.lean-lang.org](https://live.lean-lang.org/) to test your solve

[Instancer (takes a bit of time to verify outputs)](https://instancer.batmans.kitchen/challenge/i-love-lean)

